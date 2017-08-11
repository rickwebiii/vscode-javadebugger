import {getPlatform, OperatingSystem} from './Utils/OperatingSystem';
import {toHexString} from './Utils/Number';
import {
	join
} from 'path';
import {
	existsSync
} from 'fs';
import {execFile, ChildProcess} from 'child_process';
import {
	Thread, StackFrame
} from 'vscode-debugadapter';
import {Observer} from './Observer'

/**
 * The relative path to jdb inside the jdk folder.
 */
const jdbExecutableRelativePath = join(
	'bin',
	getPlatform() === OperatingSystem.Windows ? 'jdb.exe' : 'jdb'
);

function isPromptString(stdout: string) {
	const promptString = "> ";

	// Prompts can be '> ' or threadname followed by the frame number.
	// e.g. dw-admin-132-selector-ServerConnectorManager@305e4e9/38[3]
	return stdout === promptString ||
		/^\S+\[\d+\]$/.test(stdout);
}

// Returns whether or not the passed string has the command prompt in it and removes everything thereafter
// if so.
function stripCommandPrompt(stdout: string) {

	const lines = stdout.split('\n');
	let filteredStdout = "";

	let containsPrompt = false;

	for (let i = 0; i < lines.length; i++) {
		if (isPromptString(stdout)) {
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
		console.log(data);
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
		return this.runCommand(`suspend ${toHexString(threadId)}`);
	}

	public resume(threadId: number): Promise<string> {
		return this.runCommand(`resume ${toHexString(threadId)}`);
	}

	public getThreads(group: string): Promise<Thread[]> {
		return this.runCommand(`threads ${group}`)
			.then((threadString) => {
				const threads = threadString.split('\r');
				threads.shift();
				threads.pop();

				return threads.map((threadString) => {
					const splits = threadString.split(/\s+/);

					const matches = /0x.*/.exec(splits[1]);

					if (!matches) {
						throw new Error("couldn't parse thread");
					}

					const name = splits[2];
					const threadNumber = parseInt(matches[matches.length - 1]);

					return new Thread(threadNumber, name);
				});
			});
	}

	public getCallStack(threadId: number): Promise<StackFrame[]> {
		return this.runCommand(`where ${toHexString(threadId)}`)
			.then((stackTrace) => {
				return [] as StackFrame[];
			});
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