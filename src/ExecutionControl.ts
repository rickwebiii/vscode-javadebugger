import {
	StoppedEvent,
	ContinuedEvent
} from 'vscode-debugadapter';
import {JavaDebugger} from './JavaDebugger';

export function pause(javaDebugger: JavaDebugger, threadId: number): Promise<StoppedEvent> {
	return javaDebugger.suspend(threadId)
		.then(() => {
			return new StoppedEvent('Paused', threadId);
		});
}

export function resume(javaDebugger: JavaDebugger, threadId: number): Promise<ContinuedEvent> {
	return javaDebugger.resume(threadId)
		.then(() => {
			return new ContinuedEvent(threadId);
		});
}