import {
	createPacket,
	getIdWriteMethod,
	readTaggedObjectId,
	ResponsePacket,
	TaggedObjectId
} from './Common';

const commandSet = 16;

enum Commands {
	GetValues = 1,
	SetValues = 2,
	ThisObject = 3,
	PopFrames = 4
};

export function createGetThisObjectPacket(
	id: number,
	threadId: number,
	threadIdSize: number,
	frameId: number,
	frameIdSize: number
) {
	const payload = new Buffer(threadIdSize + frameIdSize);
	getIdWriteMethod(threadIdSize)(payload, threadId, 0);
	getIdWriteMethod(frameIdSize)(payload, frameId, threadIdSize);

	return createPacket(
		id,
		commandSet,
		Commands.ThisObject,
		payload
	)
}

export function decodeGetThisObjectResponse(response: ResponsePacket, objectIdSize: number): TaggedObjectId {
	return readTaggedObjectId(response.data, objectIdSize);
}