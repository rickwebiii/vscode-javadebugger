import {ObjectType, createPacket, ResponsePacket, unpackString, getIdReadMethod} from './Common';

export type IdSizes = {
	fieldId: number;
	methodId: number;
	objectId: number;
	referenceTypeId: number;
	frameId: number;
}

const commandSet = 1;

enum Command {
	Version = 1,
	ClassesBySignature = 2,
	AllClasses = 3,
	AllThreads = 4,
	IdSizes = 7,
	SuspendApp = 8,
	Resumeapp = 9
}

export enum ClassStatus {
	Verified = 1,
	Prepared = 2,
	Initialized = 4,
	Error = 8
}

export type ClassSpec = {
	type: ObjectType,
	typeId: number,
	signature: string,
	status: ClassStatus
}

export function createListThreadsPacket(id: number) {
	return createPacket(
		id,
		commandSet,
		Command.AllThreads
	);
}

export function createListClassesPacket(id: number) {
	return createPacket(
		id,
		commandSet,
		Command.AllClasses
	);
}

export function createIdSizesPacket(id: number) {
	return createPacket(
		id,
		commandSet,
		Command.IdSizes
	);
}

export function createSuspendAppPacket(id: number) {
	return createPacket(
		id,
		commandSet,
		Command.SuspendApp
	);
}

export function createResumeAppPacket(id: number) {
	return createPacket(
		id,
		commandSet,
		Command.Resumeapp
	);
}

export function decodeResumeAppResonse(packet: ResponsePacket): void {
}

export function decodeSuspendAppResonse(packet: ResponsePacket): void {
}

export function decodeIdSizesResponse(packet: ResponsePacket): IdSizes {
	return {
		fieldId: packet.data.readInt32BE(0),
		methodId: packet.data.readInt32BE(4),
		objectId: packet.data.readInt32BE(8),
		referenceTypeId: packet.data.readInt32BE(12),
		frameId: packet.data.readInt32BE(16)
	}
}

export function decodeAllClassesResponse(packet: ResponsePacket, refIdSize: number): {[key: number]: ClassSpec} {
	const count = packet.data.readInt32BE(0);
	const classes: {[key: number]: ClassSpec} = Object.create(null);
	const readRefId = getIdReadMethod(refIdSize);

	let nextOffset = 4;

	// Classes appear as follows:
	// (1 byte) tag
	// (refIdSize bytes) refId
	// (4 bytes) strlen
	// (strlen bytes) signature
	// (4 bytes) status
	for (let i = 0; i < count; i++) {
		const type = packet.data.readInt8(nextOffset);
		nextOffset += 1;
		const typeId = readRefId(packet.data, nextOffset);
		nextOffset += refIdSize;
		const signatureLength = packet.data.readInt32BE(nextOffset) + 4;
		const signature = unpackString(packet.data.slice(nextOffset));
		nextOffset += signatureLength;
		const status = packet.data.readInt32BE(nextOffset);
		nextOffset += 4;

		classes[typeId] = {
			type: type,
			typeId: typeId,
			signature: signature,
			status: status
		};
	}

	return classes;
}