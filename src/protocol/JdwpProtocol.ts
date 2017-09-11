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
export * from './EventRequest';
export * from './Event';

export function createHandshakePacket(): Buffer {
	return new Buffer(handshake);
}

export function isHandshakePacket(buffer: Buffer) {
	return buffer.toString() === handshake
}

export function readReceivedPacket(packet: Buffer): common.ResponsePacket | common.RequestPacket {
	const length = packet.readInt32BE(0)

	const commonHeader: common.PacketHeader = {
		length: length,
		id: packet.readInt32BE(4),
		flags: packet.readInt8(8),
	};

	if (common.packetIsResponse(commonHeader)) {
		return {
			...commonHeader,
			errorCode: packet.readInt16BE(9),
			data: packet.slice(11, length)
		};
	} else {
		return {
			...commonHeader,
			commandSet: packet.readInt8(9),
			command: packet.readInt8(10),
			data: packet.slice(11, length)
		};
	}
}
