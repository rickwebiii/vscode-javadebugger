import {
	createPacket,
	serializeCodeLocation,
	CodeLocation,
	ResponsePacket,
	packString
} from './Common';
import {IdSizes} from './VirtualMachine';

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

enum EventModifierKind {
	Location = 7,
	SourceNameMatch = 12
}

export abstract class EventModifier {
	public serialize(): Buffer {
		throw new Error('Must be implemented in derived class.');
	}

	public length(): number {
		return this.serialize().byteLength;
	}

	public kind(): EventModifierKind {
		throw new Error('Must be implemented in derived class.');
	}
}

export class LocationModifier extends EventModifier {
	private location: CodeLocation;
	private idSizes: IdSizes;

	constructor(location: CodeLocation, idSizes: IdSizes) {
		super();
		this.location = location;
		this.idSizes = idSizes;
	}

	public serialize() {
		return serializeCodeLocation(this.location, this.idSizes);
	}

	public kind() {
		return EventModifierKind.Location;
	}
}

export class SourceEventModifier extends EventModifier {
	private fileName: string;

	constructor(filename: string) {
		super();

		this.fileName = filename;
	}

	public serialize(): Buffer {
		return packString(this.fileName);
	}

	public kind() {
		return EventModifierKind.SourceNameMatch;
	}
}

// TODO: Add modifiers
export function createSetEventPacket(
	id: number,
	kind: EventKind,
	suspendPolicy: SuspendPolicy,
	eventModifiers: EventModifier[]
) {
	let modifierPayloadSize = 0;

	eventModifiers.forEach((modifier) => {
		modifierPayloadSize += modifier.length();
	})

	const payload = new Buffer(6 + modifierPayloadSize);
	payload.writeInt8(kind, 0);
	payload.writeInt8(suspendPolicy, 1);
	payload.writeInt32BE(eventModifiers.length, 2);

	let offset = 6;

	eventModifiers.forEach((modifier) => {
		const modBuffer = modifier.serialize();

		modBuffer.copy(payload, offset);
	});

	return createPacket(
		id,
		commandSet,
		Commands.Set,
		payload
	);
}

export function decodeSetEventResponse(response: ResponsePacket) {
}