import {createPacket, ResponsePacket} from './Common';

const commandSet = 15;

enum Commands {
	Set = 1
}

export enum EventKind {
	SingleStep = 1,
	Breakpoint = 2,
	FramPop = 3,
	Exception = 4,
	UserDefined = 5,
	ThreadStart = 6,
	ThreadEnd = 7,
	ClassPrepare = 8,
	ClassUnload = 9,
	ClassLoad = 10,
	FieldAccess = 20,
	FieldModification = 21,
	ExceptionCatch = 30,
	MethodEntry = 40,
	MethodExit = 41,
	VmInit = 90,
	VmDeath = 99
};

export enum SuspendPolicy {
	None = 0,
	EventThread = 1,
	All = 2
}

// TODO: Add modifiers
export function createSetEventPacket(id: number, kind: EventKind, suspendPolicy: SuspendPolicy) {
	const payload = new Buffer(6);
	payload.writeInt8(kind, 0);
	payload.writeInt8(suspendPolicy, 1);
	payload.writeInt32BE(0, 2);

	return createPacket(
		id,
		commandSet,
		Commands.Set,
		payload
	);
}

export function decodeSetEventResponse(response: ResponsePacket) {
}