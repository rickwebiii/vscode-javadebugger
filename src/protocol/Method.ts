import {
	createPacket,
	getIdWriteMethod,
	ResponsePacket
} from './Common'

const commandSet = 6;

enum Commands {
	LinesTable = 1
}

export type Line = {
	bytecodeIndex: number;
	lineNumber: number;
}

export type LineTable = {
	/**
	 * Since we're using double precision where the API calls for Int64,
	 * we can get into trouble unless we're very careful. If this flag is set,
	 * then line information will probably be wrong. Note that you shouldn't
	 * attempt arithmetic with these values, as they're only meant for lookups
	 */
	isFucky: boolean;
	/**
	 * If the code is in a native function, there won't be line information.
	 */
	isNative: boolean;
	start: number,
	end: number,
	lines: Line[]
}

export function createLineTablePacket(
	id: number,
	classId: number,
	classIdSize: number,
	methodId: number,
	methodIdSize: number
) {
	const payload = new Buffer(methodIdSize + classIdSize);
	getIdWriteMethod(classIdSize)(payload, classId, 0);
	getIdWriteMethod(methodIdSize)(payload, methodId, classIdSize);

	return createPacket(
		id,
		commandSet,
		Commands.LinesTable,
		payload
	);
}

export function decodeLineTableResponse(response: ResponsePacket): LineTable {
	// We're packing in64 bits into doubles. There are a number of conditions under which this
	// if fine, but we can detect when it's not. Essentially, as long as the bytepacked value double
	// is:
	// 1) < Infinity
	// 2) Is not NaN
	// 3) is positive. If this isn't the case, we're in a native method.
	const start = response.data.readDoubleBE(0);
	const end = response.data.readDoubleBE(8);
	const isNative = start === -1 && end === -1;
	const isFucky =
		start === Infinity ||
		end === Infinity ||
		start !== start ||
		end !== end;

	const numLines = response.data.readInt32BE(16);
	const lines: Line[] = [];

	for (let i = 0; i < numLines; i++) {
		const lineCodeIndex = response.data.readDoubleBE(20 + 12 * i);
		const lineNumber = response.data.readInt32BE(20 + 12 * i + 8);

		lines.push({
			bytecodeIndex: lineCodeIndex,
			lineNumber: lineNumber
		});
	}

	return {
		start: start,
		end: end,
		isFucky: isFucky,
		isNative: isNative,
		lines: lines
	};
}

/**
 * Looks up the closest line for the bytecode index in the line table.
 * @param lineTable The line table
 * @param index The byte code index
 */
export function lookupLine(lineTable: LineTable, index: number): number | undefined {
	if (lineTable.lines.length === 0) {
		return undefined;
	}

	// The index usually doesn't directly fall on a line, so we look up the previous value.
	for (let i = 1; i < lineTable.lines.length; i++) {
		if (lineTable.lines[i].bytecodeIndex > index) {
			return lineTable.lines[i].lineNumber;
		}
	}

	return undefined;
}