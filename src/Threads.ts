import {
	//Thread
} from 'vscode-debugadapter';
import {JavaDebugger} from './JavaDebugger';



export function getThreads(javaDebugger: JavaDebugger) {
	javaDebugger.getThreads('main')
		.then((threadString) => {
			const threads = threadString.split('\n');

			return threads.map((threadString) => {
				console.log(threadString);
				return threadString
			});
		});
}