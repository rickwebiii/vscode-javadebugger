import * as glob from 'glob';
import {basename} from 'path';

export function recursivelyFindFiles(filename: string, basePath: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		glob(basePath + '/**/' + filename, function(err, files) {
			resolve(files);
		})
	});
}

export function createFileMap(files: string[]): {[key:string]: string[]} {
	const map: {[key: string]: string[]} = Object.create(null);

	files.forEach((file) => {
		const fileName = basename(file);

		if (fileName in map) {
			map[fileName].push(file);
		} else {
			map[fileName] = [file];
		}
	});

	return map;
}