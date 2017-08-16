import {SuspendPolicy, EventKind} from './EventRequest';
import {ResponsePacket, getIdReadMethod} from './Common';
import {IdSizes} from './VirtualMachine';

// Since no particular sent packet directly facilitates one of these responses, we expose these
// constants so the caller can figure this mess out.
export const eventCommandSet = 64;
export const compositeCommand = 100;

export abstract class Event {
	suspendPolicy: SuspendPolicy;
	requestId: number;

	constructor(suspendPolicy: SuspendPolicy, requestId: number) {
		this.suspendPolicy = suspendPolicy;
		this.requestId = requestId;
	}
}

abstract class ThreadEvent extends Event {
	threadId: number;

	constructor(suspendPolicy: SuspendPolicy, requestId: number, threadId: number) {
		super(suspendPolicy, requestId);

		this.threadId = threadId;
	}
}

export class ThreadDeathEvent extends ThreadEvent {}
export class ThreadStartEvent extends ThreadEvent {}

type ParseEventResult = {
	event: Event,
	newOffset: number;
}

/**
 * The Java debugger protocol shits everything out as a composite event; a sequence of
 * one or more actual events. This method decodes and returns an array of said events.
 */
export function decodeCompositeEvent(response: ResponsePacket, idSizes: IdSizes): Event[] {
	const payload = response.data;
	const suspendPolicy = payload.readInt8(0) as SuspendPolicy;
	const numEvents = payload.readInt32BE(1);
	const events: Event[] = [];
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
				result = parseThreadDeathEvent(
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

	return {
		event: new ThreadStartEvent(suspendPolicy, requestId, threadId),
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

	return {
		event: new ThreadDeathEvent(suspendPolicy, requestId, threadId),
		newOffset: offset + threadIdSize + 4
	};
}