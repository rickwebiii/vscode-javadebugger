import {createConnection, Socket} from 'net';
import {Observer} from './Observer';
import * as protocol from './JdwpProtocol';
import * as vscode from 'vscode-debugadapter';
import {pollUntil} from './Utils/Poll';

export enum AppState {
	Suspended,
	Running
};

export enum ConnectionState {
	NotConnected,
	Connecting,
	Connected
};

export class Jdwp {
	private host: string;
	private port: number;
	private socket: Socket;
	private incommingDataObserver: Observer<protocol.ResponsePacket>;
	private packetId: number = 0;
	//private appState: AppState = AppState.Running;
	private connectionState: ConnectionState;
	private lastRequest: Promise<any> = Promise.resolve();;

	constructor(host: string | undefined, port: number) {
		this.host = host ? host : 'localhost';
		this.port = port;
		this.incommingDataObserver = new Observer<protocol.ResponsePacket>();
	}

	public waitForInitialization = (): Promise<{}> => {
		return new Promise((resolve, reject) => {
			// If we're already connected, we're done.
			if (this.connectionState === ConnectionState.Connected) {
				resolve();
			} else if (this.connectionState === ConnectionState.Connecting) {
				resolve(pollUntil(() => this.connectionState === ConnectionState.Connected));
				return;
			}

			this.connectionState = ConnectionState.Connecting;

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

			this.socket.on('data', this.receiveData);
			this.socket.on('error', this.socketError);
			this.socket.on('close', this.onClose);
			this.socket.on('drain', () => console.log('drain'))
			this.socket.once('data', (buffer) => {
				if (protocol.isHandshakePacket(buffer)) {
					console.log('connected!');
					this.connectionState = ConnectionState.Connected;
					resolve();
				} else {
					console.log('uh oh');
					reject();
				}
			});
		});
	}

	public getThreads(): Promise<vscode.Thread[]> {
		return this.sendReceive(protocol.createListThreadsPacket, protocol.decodeListThreadsResponse)
		.then((threadIds) => {
			const promiseGenerators = threadIds.map((threadId) => {
				return (): Promise<vscode.Thread> => {
					return this.getThreadName(threadId)
					.then((threadName) => {
						console.log(threadName);
						return new vscode.Thread(threadId, threadName)
					});
				}
			});

			return sequencePromises(promiseGenerators);
		});
	}

	public getThreadName(threadId: number): Promise<string> {
		return this.sendReceive(
			requestId => protocol.createGetThreadNamePacket(requestId, threadId),
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
		this.connectionState = ConnectionState.NotConnected;
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
		const packet = protocol.readResponse(data);

		this.incommingDataObserver.publish(packet);
	}
}