//import * as vscode from 'vscode';
import {createConnection, Socket} from 'net';
import {Observer} from './Observer';
import * as protocol from './Protocol/JdwpProtocol';
import * as vscodedebug from 'vscode-debugadapter';

export enum AppState {
	Suspended,
	Running
};

export class Jdwp {
	private host: string;
	private port: number;
	private socket: Socket;
	private incomingDataObserver: Observer<protocol.ResponsePacket>;
	private packetId: number = 0;
	private lastRequest: Promise<any> = Promise.resolve();
	private initializedPromise: Promise<any> | null = null;
	private idSizes: protocol.IdSizes = {
		fieldId: 0,
		methodId: 0,
		objectId: 0,
		referenceTypeId: 0,
		frameId: 0
	};
	private currentPacket: protocol.ResponsePacket | null = null;
	private threadsPrivate: vscodedebug.Thread[] = [];
	private fileInWorkspace: {[key: string]: string[]}

	public readonly events: Observer<protocol.Event>;

	constructor(host: string | undefined, port: number, filesInWorkspace: {[key: string]: string[]}) {
		this.host = host ? host : 'localhost';
		this.port = port;
		this.incomingDataObserver = new Observer<protocol.ResponsePacket>();
		this.fileInWorkspace = filesInWorkspace;
	}

	public get threads() {
		return this.threadsPrivate;
	}

	public waitForInitialization = (): Promise<{}> => {
		if (!this.initializedPromise) {
			this.initializedPromise = new Promise((resolve, reject) => {
				 this.connect().then(() => {
					 return this.postConnect();
				 }).then(() => {
					 resolve();
				 })
			});
		}

		return this.initializedPromise;
	}

	private connect() {
		return new Promise<{}>((resolve, reject) => {
			this.socket = createConnection(
				this.port,
				this.host,
				() => {
					console.log('connecting...');
					this.socket.write(protocol.createHandshakePacket());
				}
			);

			this.socket.setKeepAlive(true);
			this.socket.setNoDelay(true);

			this.socket.on('error', this.socketError);
			this.socket.on('close', this.onClose);
			this.socket.on('drain', () => console.log('drain'))
			this.socket.once('data', (buffer) => {
				if (protocol.isHandshakePacket(buffer)) {
					console.log('connected!');

					this.socket.on('data', this.receiveData);
					resolve();
				} else {
					console.log('Failed to connect.');
					reject();
				}
			});
		});
	}

	private postConnect() {
		return this.getObjectSizes().then((sizes) => {
			this.idSizes = sizes;
		}).then(() => {
			return this.setEvent(protocol.EventKind.ThreadStart, protocol.SuspendPolicy.None);
		}).then(() => {
			return this.setEvent(protocol.EventKind.ThreadEnd, protocol.SuspendPolicy.None);
		}).then(() => {
			return this.listenForEvents();
		});
	}

	private getObjectSizes(): Promise<protocol.IdSizes> {
		return this.sendReceive(
			protocol.createIdSizesPacket,
			protocol.decodeIdSizesResponse
		);
	}

	public getThreads(): Promise<vscodedebug.Thread[]> {
		const decode = (packet) => { return protocol.decodeListThreadsResponse(packet, this.idSizes.objectId); }

		return this.sendReceive(protocol.createListThreadsPacket, decode).then((threadIds) => {
			const promises = threadIds.map((threadId) => {
				return this.getThreadName(threadId).then((threadName) => {
					return new vscodedebug.Thread(threadId, threadName)
				});
			});

			return Promise.all(promises).then((threads) => {
				this.threadsPrivate = threads;
				return threads;
			});
		});
	}

	public getThreadName(threadId: number): Promise<string> {
		return this.sendReceive(
			requestId => protocol.createGetThreadNamePacket(requestId, threadId, this.idSizes.objectId),
			protocol.decodeGetThreadNameResponse
		);
	}

	public resumeApp() {
		return this.sendReceive(
			requestId => protocol.createResumeAppPacket(requestId),
			protocol.decodeResumeAppResonse
		);
	}

	public suspendApp() {
		return this.sendReceive(
			requestId => protocol.createSuspendAppPacket(requestId),
			protocol.decodeSuspendAppResonse
		);
	}

	public getThreadFrames(
		threadId: number,
		start: number | undefined,
		count: number | undefined
	): Promise<vscodedebug.StackFrame[]> {
		if (start === undefined) {
			start = 0;
		}

		// If you specify more frames than exist for a given stack trace, jdwp returns an error.
		// We have two options here:
		// 1) Use the API to get a frame count first and taking the max of the requested and that.
		// 2) Always get all the frames and filter down to the number requested.
		// TODO: do one of the above.
		count = -1;

		// Be ready for a great journey. We need a bunch of stuff in scope at once to translate
		// the location of each frame.
		return this.sendReceive( // Request the stack frames for the current thread
			requestId => protocol.createThreadFramesPacket(
				requestId,
				threadId,
				this.idSizes.objectId,
				start as number,
				count as number
			),
			packet => protocol.decodeThreadFramesResponse(packet, this.idSizes)
		).then((frames) => { // Look up all classes and method name for each frame
			const promises: Promise<any>[] = [
				Promise.resolve(frames),
				this.getClasses()
			];

			frames.forEach((frame) => {
				promises.push(
						this.getMethods(frame.location.classId)
				);
			});

			// The promises will resolve in the order we assigned them. First come
			// the frames, then the classes, then an array of methods for each frame.
			return Promise.all(promises);
		}).then((result) => { // Destructure our promise array and request the line table for each method
			const [frames, classes, ...methods] = result;

			const stackFrames: vscodedebug.StackFrame[] = [];
			const frameSpecs = frames as protocol.FrameSpec[];
			const classSpecs = classes as {[key: number]: protocol.ClassSpec};
			const methodSpecs = methods as {[key: number]: protocol.MethodSpec}[];

			const promises = frameSpecs.map((frame) => {
				return this.getMethodLineTable(frame.location.classId, frame.location.methodId)
			}) as Promise<protocol.LineTable>[]


			return Promise.all(promises).then((lineTables) => { // Fetch line informatio
				const promises = frameSpecs.map((frame) => {
					return this.getSourceFile(frame.location.classId).then((source) => {
						if (source) {
							return {
								source: source,
								paths: this.fileInWorkspace[source]
							}
						} else {
							return {
								source: source,
								paths: []
							}
						}
					});
				});

				return Promise.all(promises).then((sources) => { // Fetch filename information.
					for (let i = 0; i < frameSpecs.length; i++) {
						const curFrame = frameSpecs[i];
						const className = classSpecs[curFrame.location.classId].signature;
						const formattedClassName = className.substr(1).split('/').join('.');
						const methodName = methodSpecs[i][curFrame.location.methodId].name;

						const source = sources[i];

						let sourceFile = source.paths && source.paths.length > 0 ?
							new vscodedebug.Source(sources[i].source as string, source.paths[0].toString()) :
							undefined;

						const lineNumber =  lineTables[i].isNative || lineTables[i].isFucky ?
							undefined :
							protocol.lookupLine(lineTables[i], curFrame.location.index);

						stackFrames.push(new vscodedebug.StackFrame(i, `${formattedClassName}:${methodName}`, sourceFile, lineNumber))
					}

					return stackFrames;
				});
			})
		});

	}

	public getSourceFile(classId: number): Promise<string | undefined> {
		return this.sendReceive(
			requestId => protocol.createGetSourceFilePacket(requestId, classId, this.idSizes.referenceTypeId),
			response => protocol.decodeGetSourceFileResponse(response)
		).catch((errCode) => {
			if (errCode === protocol.Errors.AbsentInformation) {
				return undefined;
			} else {
				throw errCode;
			}
		})
	}

	public getMethodLineTable(classId: number, methodId: number): Promise<protocol.LineTable> {
		return this.sendReceive(
			requestId => protocol.createLineTablePacket(
				requestId,
				classId,
				this.idSizes.referenceTypeId,
				methodId,
				this.idSizes.methodId
			),
			response => protocol.decodeLineTableResponse(response)
		).catch((errorCode) => {
			// The docs don't mention returning a NativeMethod error when trying to get
			// line information for a native function, but this does seem to be the case.
			// If we get such an error, construct an object indicating such
			if (errorCode === protocol.Errors.NativeMethod) {
				return {
					start: -1,
					end: -1,
					isNative: true,
					isFucky: false,
					lines: []
				};
			} else {
				throw errorCode;
			}
		})
	}

	public getThisObject(threadId: number, frameId: number) {
		return this.sendReceive(
			requestId => protocol.createGetThisObjectPacket(
				requestId,
				threadId,
				this.idSizes.objectId,
				frameId,
				this.idSizes.frameId
			),
			response => protocol.decodeGetThisObjectResponse(response, this.idSizes.objectId)
		)
	}

	public getClasses() {
		return this.sendReceive(
			requestId => protocol.createListClassesPacket(requestId),
			response => protocol.decodeAllClassesResponse(response, this.idSizes.referenceTypeId)
		);
	}

	public getReflectedType(classId: number) {
		return this.sendReceive(
			requestId => protocol.createGetReflectedTypePacket(
				requestId,
				classId,
				this.idSizes.objectId
			),
			response => protocol.decodeGetReflectedTypeResponse(response, this.idSizes.objectId)
		)
	}

	public getMethods(typeId: number) {
		return this.sendReceive(
			requestId => protocol.createGetMethodsPacket(requestId, typeId, this.idSizes.referenceTypeId),
			response => protocol.decodeGetMethodsResponse(response, this.idSizes.methodId)
		);
	}

	public suspendThread(threadId: number) {
		return this.sendReceive(
			requestId => protocol.createSuspendThreadPacket(requestId, threadId, this.idSizes.objectId),
			protocol.decodeSuspendThreadResponse
		);
	}

	public resumeThread(threadId: number) {
		return this.sendReceive(
			requestId => protocol.createResumeThreadPacket(requestId, threadId, this.idSizes.objectId),
			protocol.decodeResumeThreadResponse
		);
	}

	public setEvent(eventKind: protocol.EventKind, suspendPolicy: protocol.SuspendPolicy) {
		return this.sendReceive(
			requestId => protocol.createSetEventPacket(requestId, eventKind, suspendPolicy),
			protocol.decodeSetEventResponse
		)
	}

	public getThread

	public detach() {
		this.initializedPromise = null;
		this.socket.end();
		this.socket.destroy();
	}

	private onClose = (error: boolean) => {
		console.log('closed');
	}

	private sendReceive<T>(
		getRequest: (requestId: number) => Buffer,
		decodeResponse: (response: protocol.ResponsePacket) => T
	): Promise<T> {
		const sendAndReceive = () => {
			return new Promise<T>((resolve, reject) => {
				const requestId = this.packetId++;
				const request = getRequest(requestId);

				const receivePromise = this.getResponse(requestId).then((response) => {
					if (response.errorCode !== 0) {
						console.error(request);
						reject(response.errorCode);
					} else {
						resolve(decodeResponse(response));
					}
				});

				this.socket.write(request);

				return receivePromise
			});
		}

		// Jdwp really hates parallel requests and will lock up if issue such.
		// So we sequentialize all requests.
		this.lastRequest = this.lastRequest.then(sendAndReceive, sendAndReceive);

		return this.lastRequest;
	}

	private getResponse(requestId: number): Promise<protocol.ResponsePacket> {
		return new Promise((resolve) => {
			this.incomingDataObserver.until((response) => {
				if (response.id === requestId) {
					try {
						resolve(response);
					} finally {
						return true;
					}
				} else {
					return false;
				}
			});
		});
	}

	private listenForEvents = () => {
		// Subscription will die with this object, so no need to clean up.
		this.incomingDataObserver.subscribe((response) => {

		})
	}

	private socketError = (err: Error) => {
		console.log(err);
	}

	private receiveData = (data: Buffer) => {
		let packet;
		if (this.currentPacket === null) {
			packet = protocol.readResponse(data);
		} else { // If this is continuation of the previous packet, append it to the previous packet.
			packet = this.currentPacket;
			packet.data = Buffer.concat([this.currentPacket.data, data]);
		}

		if (packet.length !== 11 + packet.data.byteLength) {
			this.currentPacket = packet;
			return;
		} else {
			this.currentPacket = null;
		}

		this.incomingDataObserver.publish(packet);
	}
}