import {DebugProtocol} from 'vscode-debugprotocol';

export interface JdbAttachRequest extends DebugProtocol.AttachRequest {
	/**
	 * The port to which jdb should attach.
	 */
	port: number | undefined;

	/**
	 * The path to the Java Development Kit install location.
	 */
	jdkPath: string | undefined;

	/**
	 * The hostname where the JVM resides. If undefined, the debugger will assume localhost
	 */
	hostName: string | undefined;

	workspaceRoot: string;
}