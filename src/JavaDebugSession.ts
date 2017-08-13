/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as vscode from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';
import {
	readFileSync
} from 'fs';
import {JdbAttachRequest} from './Contracts/AttachRequest';
//import {getThreadExecutionState, ThreadExecutionState} from './ExecutionControl';
import { Jdwp } from './Jdwp';
import {Errors} from './Protocol/JdwpProtocol';

/**
 * This interface should always match the schema found in the mock-debug extension manifest.
 */
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	/** An absolute path to the program to debug. */
	program: string;
	/** Automatically stop target after launch. If not specified, target does not stop. */
	stopOnEntry?: boolean;
	/** enable logging the Debug Adapter Protocol */
	trace?: boolean;
}




class MockDebugSession extends vscode.LoggingDebugSession {

	// maps from sourceFile to array of Breakpoints
	private _breakPoints = new Map<string, DebugProtocol.Breakpoint[]>();

	private debuggerInstance: Jdwp | null = null;

	private get debugger(): Jdwp {
		if (this.debuggerInstance === null) {
			throw new Error("Bugcheck: no attached debugger.");
		}

		return this.debuggerInstance;
	}

	private set debugger(value: Jdwp) {
		this.debuggerInstance = value;
	}


	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor() {
		super("mock-debug.txt");

		// this debugger uses zero-based lines and columns
		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);
	}

	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {

		// since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
		// we request them early by sending an 'initializeRequest' to the frontend.
		// The frontend will end the configuration sequence by calling 'configurationDone' request.
		this.sendEvent(new vscode.InitializedEvent());

		response.body = response.body || {};

		// This debug adapter implements the configurationDoneRequest.
		response.body.supportsConfigurationDoneRequest = true;

		// make VS Code to use 'evaluate' when hovering over source
		response.body.supportsEvaluateForHovers = true;

		// make VS Code to show a 'step back' button
		response.body.supportsStepBack = true;

		this.sendResponse(response);
	}

	protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
	}

	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
		this.debugger.detach();
		this.debuggerInstance = null;

		this.sendResponse(response);
	}

	protected attachRequest(response: DebugProtocol.AttachResponse, args: JdbAttachRequest): void {
		if (!args.port) {
			throw new Error("You must specify a port to which jdb will attach in your launch.json's attach configuration.");
		}

		this.debugger = new Jdwp(args.hostName, args.port);

		this.waitForDebugger()
			.then(() => {
				this.sendResponse(response);
			}
		);
	}

  protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments): void {
		//TODO: Figure out how to distinguish a request for pausing the last thread and pausing everything.
		this.debugger.waitForInitialization()
			.then(() => {
				const lastThread = this.debugger.threads.reduce((prev, cur) => prev.id > cur.id ? prev : cur);

				// If the last thread is specified, pause the whole app.
				if (args.threadId === lastThread.id) {
					this.debugger.suspendApp().then(() => {
						this.sendResponse(response);
						this.sendEvent(new vscode.StoppedEvent('paused', args.threadId));
					});
				} else {
					this.debugger.suspendThread(args.threadId).then(() => {
						this.sendResponse(response);
						this.sendEvent(new vscode.StoppedEvent('thread paused', args.threadId));
					});
				}
			});
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		this.debugger.waitForInitialization()
			.then(() => {
				const lastThread = this.debugger.threads.reduce((prev, cur) => prev.id > cur.id ? prev : cur);

				// If the last thread is specified, pause the whole app.
				if (args.threadId === lastThread.id) {
					this.debugger.resumeApp().then(() => {
						this.sendResponse(response);
						this.sendEvent(new vscode.ContinuedEvent(args.threadId, true));
					});
				} else {
					this.debugger.resumeThread(args.threadId).then(() => {
						this.sendResponse(response);
						this.sendEvent(new vscode.ContinuedEvent(args.threadId, false));
					});
				}
			});
			/*
		resume(this.debugger, args.threadId)
			.then((event) => {
				this.sendResponse(response);
				this.sendEvent(event);
			})*/
	}

	private waitForDebugger(): Promise<{}> {
		return new Promise((resolve) => {
			const callback = () => {
				if (!this.debuggerInstance) {
					setTimeout(callback, 1);
				} else {
					resolve()
				}
			}

			callback();
		})
		.then(() => {
			return this.debugger.waitForInitialization();
		});
	}

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {

		const path = <string>args.source.path;
		const clientLines = args.lines || [];

		// read file contents into array for direct access
		const lines = readFileSync(path).toString().split('\n');

		const breakpoints = new Array<vscode.Breakpoint>();

		// verify breakpoint locations
		for (let i = 0; i < clientLines.length; i++) {
			let l = this.convertClientLineToDebugger(clientLines[i]);
			let verified = false;
			if (l < lines.length) {
				const line = lines[l].trim();
				// if a line is empty or starts with '+' we don't allow to set a breakpoint but move the breakpoint down
				if (line.length === 0 || line.indexOf("+") === 0) {
					l++;
				}
				// if a line starts with '-' we don't allow to set a breakpoint but move the breakpoint up
				if (line.indexOf("-") === 0) {
					l--;
				}
				// don't set 'verified' to true if the line contains the word 'lazy'
				// in this case the breakpoint will be verified 'lazy' after hitting it once.
				if (line.indexOf("lazy") < 0) {
					verified = true;    // this breakpoint has been validated
				}
			}
			const bp = <DebugProtocol.Breakpoint> new vscode.Breakpoint(verified, this.convertDebuggerLineToClient(l));
			//bp.id = this._breakpointId++;
			breakpoints.push(bp);
		}
		this._breakPoints.set(path, breakpoints);

		// send back the actual breakpoint positions
		response.body = {
			breakpoints: breakpoints
		};
		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		this.waitForDebugger()
			.then(() => {
				return this.debugger.getThreads();
			})
			.then((threads) => {
				// return the default thread
				response.body = {
					threads: threads
				};
				this.sendResponse(response);
			});
	}

	/**
	 * Get the stack traces in the app.
	 */
	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
		this.waitForDebugger()
			.then(() => {
				this.debugger.getThreadFrames(args.threadId, args.startFrame, args.levels).then((frames) => {
					response.body = {
						stackFrames: frames,
						totalFrames: frames.length
					};

					this.sendResponse(response);
				});
			})
			.catch((error: Errors) => {
				this.sendErrorResponse(response, error, `Got error code ${error} when requesting a backtrace`);
			});
	}

	protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments): void {
		console.log('ass');
	}


	/*
	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {

		const frameReference = args.frameId;
		const scopes = new Array<Scope>();
		scopes.push(new Scope("Local", this._variableHandles.create("local_" + frameReference), false));
		scopes.push(new Scope("Closure", this._variableHandles.create("closure_" + frameReference), false));
		scopes.push(new Scope("Global", this._variableHandles.create("global_" + frameReference), true));

		response.body = {
			scopes: scopes
		};
		this.sendResponse(response);
	}

	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {

		const variables = new Array<DebugProtocol.Variable>();
		const id = this._variableHandles.get(args.variablesReference);
		if (id !== null) {
			variables.push({
				name: id + "_i",
				type: "integer",
				value: "123",
				variablesReference: 0
			});
			variables.push({
				name: id + "_f",
				type: "float",
				value: "3.14",
				variablesReference: 0
			});
			variables.push({
				name: id + "_s",
				type: "string",
				value: "hello world",
				variablesReference: 0
			});
			variables.push({
				name: id + "_o",
				type: "object",
				value: "Object",
				variablesReference: this._variableHandles.create("object_")
			});
		}

		response.body = {
			variables: variables
		};
		this.sendResponse(response);
	}

	protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments) : void {

		for (let ln = this._currentLine-1; ln >= 0; ln--) {
			if (this.fireEventsForLine(response, ln)) {
				return;
			}
		}
		this.sendResponse(response);
		// no more lines: stop at first line
		this._currentLine = 0;
		this.sendEvent(new StoppedEvent("entry", MockDebugSession.THREAD_ID));
 	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {

		for (let ln = this._currentLine+1; ln < this._sourceLines.length; ln++) {
			if (this.fireStepEvent(response, ln)) {
				return;
			}
		}
		this.sendResponse(response);
		// no more lines: run to end
		this.sendEvent(new TerminatedEvent());
	}

	protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {

		for (let ln = this._currentLine-1; ln >= 0; ln--) {
			if (this.fireStepEvent(response, ln)) {
				return;
			}
		}
		this.sendResponse(response);
		// no more lines: stop at first line
		this._currentLine = 0;
		this.sendEvent(new StoppedEvent("entry", MockDebugSession.THREAD_ID));
	}

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {

		response.body = {
			result: `evaluate(context: '${args.context}', '${args.expression}')`,
			variablesReference: 0
		};
		this.sendResponse(response);
	}*/

	//---- some helpers

	/**
	 * Fire StoppedEvent if line is not empty.
	 */
	/*
	private fireStepEvent(response: DebugProtocol.Response, ln: number): boolean {

		if (this._sourceLines[ln].trim().length > 0) {	// non-empty line
			this._currentLine = ln;
			this.sendResponse(response);
			this.sendEvent(new StoppedEvent("step", MockDebugSession.THREAD_ID));
			return true;
		}
		return false;
	}*/

	/**
	 * Fire StoppedEvent if line has a breakpoint or the word 'exception' is found.
	 */
	/*
	private fireEventsForLine(response: DebugProtocol.Response, ln: number): boolean {

		// find the breakpoints for the current source file
		const breakpoints = this._breakPoints.get(this._sourceFile);
		if (breakpoints) {
			const bps = breakpoints.filter(bp => bp.line === this.convertDebuggerLineToClient(ln));
			if (bps.length > 0) {
				this._currentLine = ln;

				// 'continue' request finished
				this.sendResponse(response);

				// send 'stopped' event
				this.sendEvent(new StoppedEvent("breakpoint", MockDebugSession.THREAD_ID));

				// the following shows the use of 'breakpoint' events to update properties of a breakpoint in the UI
				// if breakpoint is not yet verified, verify it now and send a 'breakpoint' update event
				if (!bps[0].verified) {
					bps[0].verified = true;
					this.sendEvent(new BreakpointEvent("update", bps[0]));
				}
				return true;
			}
		}

		// if word 'exception' found in source -> throw exception
		if (this._sourceLines[ln].indexOf("exception") >= 0) {
			this._currentLine = ln;
			this.sendResponse(response);
			this.sendEvent(new StoppedEvent("exception", MockDebugSession.THREAD_ID));
			this.log('exception in line', ln);
			return true;
		}

		return false;
	}

	private log(msg: string, line: number) {
		const e = new OutputEvent(`${msg}: ${line}\n`);
		(<DebugProtocol.OutputEvent>e).body.variablesReference = this._variableHandles.create("args");
		this.sendEvent(e);	// print current line on debug console
	}*/
}

vscode.DebugSession.run(MockDebugSession);
