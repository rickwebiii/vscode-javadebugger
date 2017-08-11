import {
	StoppedEvent,
	ContinuedEvent
} from 'vscode-debugadapter';
import {JavaDebugger} from './JavaDebugger';

export enum ThreadExecutionState {
	Paused,
	Running
}

let threadExecutionState = Object.create(null);

export function getThreadExecutionState(threadId: number) {
	return threadId in threadExecutionState ?
		threadExecutionState[threadId] :
		ThreadExecutionState.Running;

}

export function pause(javaDebugger: JavaDebugger, threadId: number): Promise<StoppedEvent> {
	return javaDebugger.suspend(threadId)
		.then(() => {
			threadExecutionState[threadId] = ThreadExecutionState.Paused;
			return new StoppedEvent('Paused', threadId);
		});
}

export function resume(javaDebugger: JavaDebugger, threadId: number): Promise<ContinuedEvent> {
	return javaDebugger.resume(threadId)
		.then(() => {
			threadExecutionState[threadId] = ThreadExecutionState.Running;
			return new ContinuedEvent(threadId, false);
		});
}