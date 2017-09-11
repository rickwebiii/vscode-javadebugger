import {
	getIdReadMethod,
	getIdWriteMethod,
	createPacket,
	ResponsePacket,
	CodeLocation,
	unpackString
} from './Common';

import {
	IdSizes
} from './VirtualMachine';

const commandSet = 11;

enum Command {
	Name = 1,
	Suspend = 2,
	Resume = 3,
	Frames = 6
}

export type FrameSpec = {
	id: number;
	location: CodeLocation;
}

export function createSuspendThreadPacket(id: number, threadId: number, threadIdSize: number) {
	const payload = new Buffer(threadIdSize);
	getIdWriteMethod(threadIdSize)(payload, threadId, 0);

	return createPacket(
		id,
		commandSet,
		Command.Suspend,
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
		commandSet,
		Command.Frames,
		payload
	);
}

export function createResumeThreadPacket(id: number, threadId: number, threadIdSize: number) {
	const payload = new Buffer(threadIdSize);
	getIdWriteMethod(threadIdSize)(payload, threadId, 0);

	return createPacket(
		id,
		commandSet,
		Command.Resume,
		payload
	);
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

export function createGetThreadNamePacket(id: number, threadId: number, threadIdSize: number) {
	const payload = new Buffer(threadIdSize);
	getIdWriteMethod(threadIdSize)(payload, threadId, 0);

	return createPacket(
		id,
		commandSet,
		Command.Name,
		payload
	);
}

export function decodeGetThreadNameResponse(packet: ResponsePacket): string {
	return unpackString(packet.data);
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