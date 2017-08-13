import {
	createPacket,
	ResponsePacket,
	getIdReadMethod,
	getIdWriteMethod,
	unpackString
} from './Common';

const commandSet = 2;

enum Command {
	Methods = 5,
	SourceFile = 7
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

export function createGetMethodsPacket(id: number, refId: number, refIdSize: number) {
	const payload = new Buffer(refIdSize);
	getIdWriteMethod(refIdSize)(payload, refId, 0);

	return createPacket(
		id,
		commandSet,
		Command.Methods,
		payload
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

export function createGetSourceFilePacket(id: number, classId: number, classIdSize: number) {
	const payload = new Buffer(classIdSize);
	getIdWriteMethod(classIdSize)(payload, classId, 0);

	return createPacket(
		id,
		commandSet,
		Command.SourceFile,
		payload
	);
}

export function decodeGetSourceFileResponse(response: ResponsePacket): string {
	return unpackString(response.data);
}