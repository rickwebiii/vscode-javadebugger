import {createConnection, Socket} from 'net';
import {Observer} from './Observer';
import * as protocol from './JdwpProtocol';
import * as vscode from 'vscode-debugadapter';

export enum AppState {
	Suspended,
	Running
};

export class Jdwp {
	private host: string;
	private port: number;
	private socket: Socket;
	private incommingDataObserver: Observer<protocol.ResponsePacket>;
	private packetId: number = 0;
	//private appState: AppState = AppState.Running;
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
	private threadsPrivate: vscode.Thread[] = [];

	constructor(host: string | undefined, port: number) {
		this.host = host ? host : 'localhost';
		this.port = port;
		this.incommingDataObserver = new Observer<protocol.ResponsePacket>();
	}

	public get threads() {
		return this.threadsPrivate;
	}

	public waitForInitialization = (): Promise<{}> => {
		if (!this.initializedPromise) {
			this.initializedPromise = new Promise((resolve, reject) => {
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

						this.getObjectSizes().then((sizes) => {
							this.idSizes = sizes;
							resolve();
						});
					} else {
						console.log('uh oh');
						reject();
					}
				});
			});
		}

		return this.initializedPromise;
	}

	private getObjectSizes(): Promise<protocol.IdSizes> {
		return this.sendReceive(
			protocol.createIdSizesPacket,
			protocol.decodeIdSizesResponse
		);
	}

	public getThreads(): Promise<vscode.Thread[]> {
		const decode = (packet) => { return protocol.decodeListThreadsResponse(packet, this.idSizes.objectId); }

		return this.sendReceive(protocol.createListThreadsPacket, decode).then((threadIds) => {
			const promises = threadIds.map((threadId) => {
				return this.getThreadName(threadId).then((threadName) => {
					return new vscode.Thread(threadId, threadName)
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
		// Jdwp really hates parallel requests and will lock up if issue such.
		// So we sequentialize all requests.
		this.lastRequest = this.lastRequest.then(() => {
			return new Promise<T>((resolve, reject) => {
				const requestId = this.packetId++;
				const request = getRequest(requestId);

				this.getResponse(requestId).then((response) => {
					console.log('receive ', requestId);
					resolve(decodeResponse(response));
				});

				console.log('send ', requestId);
				this.socket.write(request);
			});
		});

		return this.lastRequest;
	}

	private getResponse(requestId: number): Promise<protocol.ResponsePacket> {
		return new Promise((resolve) => {
			this.incommingDataObserver.until((response) => {
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

		this.incommingDataObserver.publish(packet);
	}
}