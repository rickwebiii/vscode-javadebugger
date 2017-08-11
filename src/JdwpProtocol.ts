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

export function createGetThreadNamePacket(id: number, threadId: number) {
	const payload = new Buffer(4);
	payload.writeInt32BE(threadId, 0);

	return createPacket(
		id,
		CommandSet.ThreadReference,
		ThreadReferenceCommand.Name,
		payload
	);
}

/**
 * Returns an array of thread ids.
 * @param packet the packet to decode
 */
export function decodeListThreadsResponse(packet: ResponsePacket): number[] {
	const length = packet.data.readInt32BE(0);
	const threadIds: number[] = [];

	for (let i = 0; i < length; i++) {
		const threadId = packet.data.readInt32BE(4 + 4 * i);
		threadIds.push(threadId);
	}

	return threadIds;
}

export function decodeGetThreadNameResponse(packet: ResponsePacket): string {
	return unpackString(packet.data);
}

/**
 * JDWP specifies that strings consist of a 4-byte big endian length followed by the characters in the string.
 * Unpacks a JDWP string and returns a Javascript utf-8 string.
 */
function unpackString(stringBuffer: Buffer): string {
	return stringBuffer.slice(4).toString()
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