// https://docs.oracle.com/javase/1.5.0/docs/guide/jpda/jdwp/jdwp-protocol.html#JDWP_VirtualMachine_AllThreads

const handshake = 'JDWP-Handshake';

enum CommandSet {
	VirtualMachine = 1,
	ReferenceType = 2,
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

enum ReferenceTypeCommand {
	Methods = 5
}

enum ThreadReferenceCommand {
	Name = 1,
	Suspend = 2,
	Resume = 3,
	Frames = 6
}

export type MethodSpec = {
	id: number,
	name: string,
	signature: string,
	/**
	 * TODO: Should be an enum?
	 */
	modBits: number;
}

export enum Errors {
	ThreadNotSuspended = 13,
	InvalidObject = 20,
	VmDead = 112
}

export enum TypeTag {
	Class = 1,
	Interface = 2,
	Array = 3
}

export type CodeLocation = {
	type: TypeTag,
	classId: number,
	methodId: number,
	/**
	 * Index values are 8-bytes, so we pack it into a double. We should never do math with these,
	 * as the values may be NaN or +-Infinity.
	 */
	index: number
}

export enum ClassStatus {
	Verified = 1,
	Prepared = 2,
	Initialized = 4,
	Error = 8
}

export type FrameSpec = {
	id: number;
	location: CodeLocation;
}

export type ClassSpec = {
	type: TypeTag,
	typeId: number,
	signature: string,
	status: ClassStatus
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

export function createListClassesPacket(id: number) {
	return createPacket(
		id,
		CommandSet.VirtualMachine,
		VirtualMachineCommand.AllClasses
	);
}

export function createSuspendThreadPacket(id: number, threadId: number, threadIdSize: number) {
	const payload = new Buffer(threadIdSize);
	getIdWriteMethod(threadIdSize)(payload, threadId, 0);

	return createPacket(
		id,
		CommandSet.ThreadReference,
		ThreadReferenceCommand.Suspend,
		payload
	);
}

export function createThreadFramesPacket(
	id: number,
	threadId: number,
	threadIdSize: number,
	start: number,
	count: number
) {
	const payload = new Buffer(threadIdSize + 8);
	getIdWriteMethod(threadIdSize)(payload, threadId, 0);
	payload.writeInt32BE(start, threadIdSize);
	payload.writeInt32BE(count, threadIdSize + 4);

	return createPacket(
		id,
		CommandSet.ThreadReference,
		ThreadReferenceCommand.Frames,
		payload
	);
}

export function createResumeThreadPacket(id: number, threadId: number, threadIdSize: number) {
	const payload = new Buffer(threadIdSize);
	getIdWriteMethod(threadIdSize)(payload, threadId, 0);

	return createPacket(
		id,
		CommandSet.ThreadReference,
		ThreadReferenceCommand.Resume,
		payload
	);
}

export function createGetMethodsPacket(id: number, refId: number, refIdSize: number) {
	const payload = new Buffer(refIdSize);
	payload.writeInt32BE(refId, 0);

	return createPacket(
		id,
		CommandSet.ReferenceType,
		ReferenceTypeCommand.Methods,
		payload
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

export function decodeGetMethodsResponse(response: ResponsePacket, methodIdSize: number): {[key: number]: MethodSpec} {
	const count = response.data.readInt32BE(0);
	const methods: {[key: number]: MethodSpec} = Object.create(null);
	const getMethodId = getIdReadMethod(methodIdSize);

	let currentOffset = 4;

	// Methods appear as follows:
	// (methodIdSize bytes) methodId
	// (4 bytes) nameLen
	// (nameLen bytes) name
	// (4 bytes) sigLen
	// (sigLen bytes) signature
	// (4 bytes) modBits
	for (let i = 0; i < count; i++) {
		const methodId = getMethodId(response.data, currentOffset);
		currentOffset += methodIdSize;
		const nameLength = response.data.readInt32BE(currentOffset);
		const name = unpackString(response.data.slice(currentOffset));
		currentOffset += nameLength + 4;
		const signatureLength = response.data.readInt32BE(currentOffset);
		const signature = unpackString(response.data.slice(currentOffset));
		currentOffset += signatureLength + 4;
		const modBits = response.data.readInt32BE(currentOffset);
		currentOffset += 4;

		methods[methodId] ={
			id: methodId,
			name: name,
			signature: signature,
			modBits: modBits
		};
	}

	return methods;
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

export function decodeResumeAppResonse(packet: ResponsePacket): void {
}

export function decodeSuspendAppResonse(packet: ResponsePacket): void {
}

export function decodeResumeThreadResponse(packet: ResponsePacket): void {
}

export function decodeSuspendThreadResponse(packet: ResponsePacket): void {
}

export function decodeThreadFramesResponse(packet: ResponsePacket, idSizes: IdSizes): FrameSpec[] {
	const count = packet.data.readInt32BE(0);
	const frames: FrameSpec[] = [];
	const frameReader = getIdReadMethod(idSizes.frameId);
	const referenceReader = getIdReadMethod(idSizes.referenceTypeId);
	const methodReader = getIdReadMethod(idSizes.methodId);

	const frameIdOffset = 0;
	const typeOffset = frameIdOffset + idSizes.frameId;
	const classIdOffset = typeOffset + 1;
	const methodIdOffset = classIdOffset + idSizes.referenceTypeId;
	const indexOffset = methodIdOffset + idSizes.methodId;

	// A frame consists of
	// (frameIdSize) frameId
	// (1 byte) tag
	// (refIdSize) classId
	// (methodIdSize) methodId
	// (8 bytes) index
	const frameSize = indexOffset + 8;

	for (let i = 0; i < count; i++) {
		frames.push({
			id: frameReader(packet.data, 4 + i * frameSize),
			location: {
				type: packet.data.readInt8(4 + i * frameSize + typeOffset),
				classId: referenceReader(packet.data, 4 + i * frameSize + classIdOffset),
				methodId: methodReader(packet.data, 4 + i * frameSize + methodIdOffset),
				index: packet.data.readDoubleBE(4 + i * frameSize + indexOffset)
			}
		});
	}

	return frames;
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
	const numBytes = stringBuffer.readInt32BE(0);

	return stringBuffer.slice(4, 4 + numBytes).toString()
}

export function readResponse(packet: Buffer): ResponsePacket {
	const length = packet.readInt32BE(0)

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