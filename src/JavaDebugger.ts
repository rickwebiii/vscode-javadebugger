import {getPlatform, OperatingSystem} from './Utils/OperatingSystem';
import {
	join
} from 'path';
import {
	existsSync
} from 'fs';
import {execFile, ChildProcess} from 'child_process';

/**
 * The relative path to jdb inside the jdk folder.
 */
const jdbExecutableRelativePath = join(
	'bin',
	getPlatform() === OperatingSystem.Windows ? 'jdb.exe' : 'jdb'
);

type Subscription = string;

// Returns whether or not the passed string has the command prompt in it and removes everything thereafter
// if so.
function stripCommandPrompt(stdout: string) {
	const promptString = "> ";
	const lines = stdout.split('\n');
	let filteredStdout = "";

	let containsPrompt = false;

	for (let i = 0; i < lines.length; i++) {
		if (lines[i] === promptString) {
			containsPrompt = true;
			break;
		} else {
			filteredStdout += lines[i];
		}
	}

	return {
		containsPrompt: containsPrompt,
		filteredStdout: filteredStdout
	};
}

export class Observer<T> {
	private subscriptions: {[key: string]: (value: T) => void} = Object.create(null);
	private nextSubscription = 0;

	constructor() {

	}

	/**
	 * Keeps giving notifications until the callback returns true.
	 * @param callback
	 */
	public until(callback: (value: T) => boolean) {
		let subscription: Subscription | null = null;

		const onNext = (value: T) => {
			if (callback(value)) {
				this.removeSubscription(subscription as Subscription);
			}
		}

		subscription = this.subscribe(onNext);
	}

	/**
	 * A one shot that subscribes to the next value and then unregisters the subscription.
	 */
	public next(callback: (value: T) => void) {
		this.until((value) => {
			callback(value);
			return true;
		})
	}

	public removeSubscription = (subscription: Subscription) => {
		delete this.subscriptions[subscription];

		console.log("removing " + subscription);
	}

	public subscribe = (callback: (value: T) => void): Subscription => {
		const subscription = this.nextSubscription.toString();
		this.nextSubscription++;

		this.subscriptions[subscription] = callback;

		console.log("subscribed " + subscription);

		return subscription;
	}

	public publish = (value: T) => {
		if (Object.keys(this.subscriptions).length === 0){
			console.log("no subscribers", value);
		}

		for (let key in this.subscriptions) {
			this.subscriptions[key](value);
		}
	}
}

export class JavaDebugger {
	private jdbProcess: ChildProcess;
	private stdoutObserver: Observer<string> = new Observer();
	private initialized: boolean = false;

	private constructor(jdbProcess: ChildProcess) {
		this.jdbProcess = jdbProcess;
		jdbProcess.stdin.setDefaultEncoding('utf-8');

		// Wait for Initializing jdb... on stdout.
		this.stdoutObserver.until((value) => {
			if(stripCommandPrompt(value).containsPrompt) {
				this.initialized = true;
				return true;
			} else {
				return false;
			}
		});

		jdbProcess.stdout.on('data', this.onStdout);
	}

	public waitForInitialization(): Promise<{}> {
		return new Promise<{}>((resolve) => {
			const checkInitialized = () => {
				if (!this.initialized) {
					setTimeout(checkInitialized, 1);
				} else {
					resolve();
				}
			}

			checkInitialized();
		});
	}

	private onStdout = (data: string) => {
		this.stdoutObserver.publish(data);
	}

	private runCommand(command: string): Promise<string> {
		if (!this.initialized) {
			throw new Error("You need to wait on waitForInitialization() before running commands.");
		}

		return new Promise<string>((resolve, reject) => {
			let response = "";

			this.stdoutObserver.until((data: string) => {
				const filteredStdout = stripCommandPrompt(data);

				response += filteredStdout.filteredStdout;

				if (filteredStdout.containsPrompt) {
					resolve(response);
				}

				return filteredStdout.containsPrompt;
			});

			console.log(command);

			this.jdbProcess.stdin.write(command + '\n');
		});
	}

	public kill() {
		this.jdbProcess.kill();
	}

	public help(): Promise<string> {
		return this.runCommand('help');
	}

	public suspend(threadId: number): Promise<string> {
		return this.runCommand(`suspend ${threadId}`);
	}

	public resume(threadId: number): Promise<string> {
		return this.runCommand(`resume ${threadId}`);
	}

	public getThreads(group: string): Promise<string> {
		return this.runCommand(`threads ${group}`);
	}

	public static launch(jdkPath: string | undefined): JavaDebugger {
		return JavaDebugger.launchInternal(jdkPath, []);
	}

	public static attach(jdkPath: string | undefined, hostName: string | undefined, port: number) {
		// localhost is the default.
		if (!hostName) {
			hostName = "localhost"
		}

		const args = [
			'-connect',
			`com.sun.jdi.SocketAttach:hostname=${hostName},port=${port.toString()}`
		];

		return this.launchInternal(jdkPath, args);
	}

	private static launchInternal(
		jdkPath: string | undefined,
		args: string[]
	): JavaDebugger {
		if (!jdkPath)	{
			throw new Error("You must defined jdkPath in your launch.json's launch/attach configuration for Java.");
		}

		// The bin directory in the jdk path
		const jdbPath = join(jdkPath, jdbExecutableRelativePath);

		if (!existsSync(jdbPath)) {
			throw new Error(`Couldn't find ${jdbPath}. Please ensure your jdkPath points to jdk.`);
		}

		const jdbProcess = execFile(
			jdbPath,
			args
		);

		return new JavaDebugger(jdbProcess);
	}
}