export enum Errors {
	InvalidThread = 10,
	ThreadNotSuspended = 13,
	InvalidObject = 20,
	InvalidClass = 21,
	AbsentInformation = 101,
	VmDead = 112,
	NativeMethod = 511
}

export type ResponseHeader = {
	length: number,
	id: number,
	flags: number,
	errorCode: Errors
}

export enum TypeTag {
	Class = 1,
	Interface = 2,
	Array = 3
}

export type ResponsePacket = ResponseHeader & {
	data: Buffer
}

export type TaggedObjectId = {
	tag: TypeTag,
	id: number
}

export function createPacket<CommandType extends number>(
	id: number,
	commandSet: number,
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

/**
 * JDWP specifies that strings consist of a 4-byte big endian length followed by the characters in the string.
 * Unpacks a JDWP string and returns a Javascript utf-8 string.
 */
export function unpackString(stringBuffer: Buffer): string {
	const numBytes = stringBuffer.readInt32BE(0);

	return stringBuffer.slice(4, 4 + numBytes).toString()
}

export function readTaggedObjectId(buffer: Buffer, objectIdSize: number): TaggedObjectId {
	return {
		tag: buffer.readInt8(0),
		id: getIdReadMethod(objectIdSize)(buffer, 1)
	};
}

/**
 * Returns the method appropriate for reading the id based on its size.
 * @param idSize the size of the id.
 */
export function getIdReadMethod(idSize: number): (buffer: Buffer, offset: number) => number {
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

export function getIdWriteMethod(idSize: number): (buffer: Buffer, value: number, offset: number) => number {
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
