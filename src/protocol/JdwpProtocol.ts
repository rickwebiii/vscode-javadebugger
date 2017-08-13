// https://docs.oracle.com/javase/1.5.0/docs/guide/jpda/jdwp/jdwp-protocol.html#JDWP_VirtualMachine_AllThreads

const handshake = 'JDWP-Handshake';
import * as common from './Common';
export * from './Common';
export * from './VirtualMachine';
export * from './Thread';
export * from './StackFrame';
export * from './ReferenceType';
export * from './ClassObjectReference';
export * from './Method';

export function createHandshakePacket(): Buffer {
	return new Buffer(handshake);
}

export function isHandshakePacket(buffer: Buffer) {
	return buffer.toString() === handshake
}

export function readResponse(packet: Buffer): common.ResponsePacket {
	const length = packet.readInt32BE(0)

	return {
		length: length,
		id: packet.readInt32BE(4),
		flags: packet.readInt8(8),
		errorCode: packet.readInt16BE(9),
		data: packet.slice(11, length)
	}
}

