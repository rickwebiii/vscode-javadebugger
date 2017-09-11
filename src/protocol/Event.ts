import {SuspendPolicy, EventKind} from './EventRequest';
import {RequestPacket, getIdReadMethod} from './Common';
import {IdSizes} from './VirtualMachine';

// Since no particular sent packet directly facilitates one of these responses, we expose these
// constants so the caller can figure this mess out.
export const eventCommandSet = 64;
export const compositeCommand = 100;

export interface DebuggerEvent {
	kind: EventKind,
	suspendPolicy: SuspendPolicy,
	requestId: number
}

export interface ThreadEvent extends DebuggerEvent {
	threadId: number;
}

type ParseEventResult = {
	event: DebuggerEvent,
	newOffset: number;
}

/**
 * The Java debugger protocol shits everything out as a composite event; a sequence of
 * one or more actual events. This method decodes and returns an array of said events.
 */
export function decodeCompositeEvent(response: RequestPacket, idSizes: IdSizes): DebuggerEvent[] {
	console.log(response.data.length);

	const payload = response.data;
	const suspendPolicy = payload.readInt8(0) as SuspendPolicy;
	const numEvents = payload.readInt32BE(1);
	const events: DebuggerEvent[] = [];
	let currentOffset = 5;

	for (let i = 0; i < numEvents; i++) {
		const eventKind = payload.readInt8(currentOffset) as EventKind;
		currentOffset++;

		let result: ParseEventResult | null = null;

		switch(eventKind) {
			case EventKind.ThreadStart:
				result = parseThreadStartEvent(
					payload,
					currentOffset,
					suspendPolicy,
					idSizes.objectId
				);

				currentOffset = result.newOffset;
				events.push(result.event);

				break;

			case EventKind.ThreadEnd:
				result = 	parseThreadDeathEvent(
					payload,
					currentOffset,
					suspendPolicy,
					idSizes.objectId
				);

				currentOffset = result.newOffset;
				events.push(result.event);
				break;

			default:
				throw new Error('Event not implemented');
		}
	}

	return events;
}

function parseThreadStartEvent(
	payload: Buffer,
	offset: number,
	suspendPolicy: SuspendPolicy,
	threadIdSize: number
): ParseEventResult {
	const requestId = payload.readInt32BE(offset);
	const threadId = getIdReadMethod(threadIdSize)(payload, offset + 4);

	const threadEvent: ThreadEvent = {
		kind: EventKind.ThreadStart,
		suspendPolicy: suspendPolicy,
		requestId: requestId,
		threadId: threadId
	}

	return {
		event: threadEvent,
		newOffset: offset + threadIdSize + 4
	};
}

function parseThreadDeathEvent(
	payload: Buffer,
	offset: number,
	suspendPolicy: SuspendPolicy,
	threadIdSize: number
): ParseEventResult {
	const requestId = payload.readInt32BE(offset);
	const threadId = getIdReadMethod(threadIdSize)(payload, offset + 4);

	console.log(requestId)

	const threadEvent: ThreadEvent = {
		kind: EventKind.ThreadEnd,
		suspendPolicy: suspendPolicy,
		requestId: requestId,
		threadId: threadId
	}

	return {
		event: threadEvent,
		newOffset: offset + threadIdSize + 4
	};
}