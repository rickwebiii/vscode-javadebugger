// https://docs.oracle.com/javase/1.5.0/docs/guide/jpda/jdwp/jdwp-protocol.html#JDWP_VirtualMachine_AllThreads

const handshake = 'JDWP-Handshake';

enum CommandSet {
	VirtualMachine = 1,
	ThreadReference = 11
};

enum VirtualMachineCommand {
	Version = 1,
	ClassesBySignature = 2,
	AllClasses = 3,
	AllThreads = 4,
	IdSizes = 7,
	SuspendApp = 8,
	Resumeapp = 9
}

enum ThreadReferenceCommand {
	Name = 1
}

enum Errors {
	VmDead = 112
}

export type ResponseHeader = {
	length: number,
	id: number,
	flags: number,
	errorCode: Errors
}

export type IdSizes = {
	fieldId: number;
	methodId: number;
	objectId: number;
	referenceTypeId: number;
	frameId: number;
}

export type ResponsePacket = ResponseHeader & {
	data: Buffer
}

export function createHandshakePacket(): Buffer {
	return new Buffer(handshake);
}

export function isHandshakePacket(buffer: Buffer) {
	return buffer.toString() === handshake
}

export function createListThreadsPacket(id: number) {
	return createPacket(
		id,
		CommandSet.VirtualMachine,
		VirtualMachineCommand.AllThreads
	);
}

export function createIdSizesPacket(id: number) {
	return createPacket(
		id,
		CommandSet.VirtualMachine,
		VirtualMachineCommand.IdSizes
	);
}

export function createSuspendAppPacket(id: number) {
	return createPacket(
		id,
		CommandSet.VirtualMachine,
		VirtualMachineCommand.SuspendApp
	);
}

export function createResumeAppPacket(id: number) {
	return createPacket(
		id,
		CommandSet.VirtualMachine,
		VirtualMachineCommand.Resumeapp
	);
}

export function decodeResumeAppResonse(packet: ResponsePacket): void {
	return;
}

export function decodeSuspendAppResonse(packet: ResponsePacket): void {
	return;
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

export function createGetThreadNamePacket(id: number, threadId: number, threadIdSize: number) {
	const payload = new Buffer(threadIdSize);
	getIdWriteMethod(threadIdSize)(payload, threadId, 0);

	return createPacket(
		id,
		CommandSet.ThreadReference,
		ThreadReferenceCommand.Name,
		payload
	);
}

/**
 * Returns the method appropriate for reading the id based on its size.
 * @param idSize the size of the id.
 */
function getIdReadMethod(idSize: number): (buffer: Buffer, offset: number) => number {
	switch(idSize) {
		case 1:
			return (buffer, offset) => buffer.readInt8(offset);
		case 2:
			return (buffer, offset) => buffer.readInt16BE(offset);
		case 4:
			return (buffer, offset) => buffer.readInt32BE(offset);
		case 8:
			return (buffer, offset) => buffer.readDoubleBE(offset);
		default:
			throw new Error('debugging this Java vm isnt supported due to its object size.');
	}
}

function getIdWriteMethod(idSize: number): (buffer: Buffer, value: number, offset: number) => number {
	switch(idSize) {
		case 1:
			return (buffer, value, offset) => buffer.writeInt8(value, offset);
		case 2:
			return (buffer, value, offset) => buffer.writeInt16BE(value, offset);
		case 4:
			return (buffer, value, offset) => buffer.writeInt32BE(value, offset);
		case 8:
			return (buffer, value, offset) => buffer.writeDoubleBE(value, offset);
		default:
			throw new Error('debugging this Java vm isnt supported due to its object size');
	}
}

/**
 * Returns an array of thread ids.
 * @param packet the packet to decode
 */
export function decodeListThreadsResponse(packet: ResponsePacket, threadIdSize: number): number[] {
	const length = packet.data.readInt32BE(0);
	const threadIds: number[] = [];
	const threadIdReader = getIdReadMethod(threadIdSize);

	for (let i = 0; i < length; i++) {
		const threadId = threadIdReader(packet.data, 4 + threadIdSize * i);
		threadIds.push(threadId);
	}

	return threadIds;
}

export function decodeGetThreadNameResponse(packet: ResponsePacket): string {
	return unpackString(packet.data);
}

/**
 * Within the range limitations of double precision, will unpack a 64-bit big endian int into a double.
 */
/*
function readUInt64BE(buffer: Buffer, offset: number): number {
	// Get the high order bytes.
	const high = buffer.readUInt32BE(offset);
	const low = buffer.readUInt32BE(offset + 4);

	return (1 << 32) * high + low;
}*/

/**
 * JDWP specifies that strings consist of a 4-byte big endian length followed by the characters in the string.
 * Unpacks a JDWP string and returns a Javascript utf-8 string.
 */
function unpackString(stringBuffer: Buffer): string {
	return stringBuffer.slice(4).toString()
}

export function readResponse(packet: Buffer): ResponsePacket {
	const length = packet.readInt32BE(0)
	console.log(length, packet.slice(11, length).byteLength);

	return {
		length: length,
		id: packet.readInt32BE(4),
		flags: packet.readInt8(8),
		errorCode: packet.readInt16BE(9),
		data: packet.slice(11, length)
	}
}

function createPacket<CommandType extends number>(
	id: number,
	commandSet: CommandSet,
	command: CommandType,
	data: Buffer = new Buffer(0)
) {
	const length =  11 + data.byteLength;
	const header = Buffer.alloc(11);

	header.writeInt32BE(length, 0);
	header.writeInt32BE(id, 4);
	header.writeInt8(0, 8);
	header.writeInt8(commandSet, 9);
	header.writeInt8(command, 10);

	return Buffer.concat([header, data]);
}