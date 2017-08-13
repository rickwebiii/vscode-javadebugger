import {
	createPacket,
	getIdWriteMethod,
	ResponsePacket,
	TaggedObjectId,
	readTaggedObjectId
} from './Common'

const commandSet = 17;

enum Commands {
	ReflectedType = 1
}

/**
 * Requests the reference id for an object from its object id.
 * @param id The sequence number of the request
 * @param classObjectId The class object id
 * @param objectIdSize The size of an objectId
 */
export function createGetReflectedTypePacket(id: number, classObjectId: number, objectIdSize: number): Buffer {
 const payload = new Buffer(objectIdSize);
 getIdWriteMethod(objectIdSize)(payload, classObjectId, 0);

 return createPacket(
	 id,
		commandSet,
		Commands.ReflectedType,
		payload
 );
}

/**
 * Unpacks a GetReflectedType response.
 * @param response the response packet
 * @param objectIdSize the size of an objectId
 */
export function decodeGetReflectedTypeResponse(response: ResponsePacket, objectIdSize: number): TaggedObjectId {
	return readTaggedObjectId(response.data, objectIdSize);
}