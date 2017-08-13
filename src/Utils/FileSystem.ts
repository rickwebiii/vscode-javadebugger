import {readdir, stat} from 'fs';
import {resolve} from 'path';

export function recursivelyFindFile(filename: string, basePath: string): Promise<string[]> {
	let paths: string[] = [];
	return new Promise((resolvePromise, reject) => {
		readdir(basePath, (err, files) => {
			let numFilesToExamine = files.length;

			files.forEach((file) => {
				const filePath = resolve(file);

				if (file === filename) {
					paths.push(filePath);
				}

				stat(filePath, (err, stats) => {
					if (stats.isDirectory) {
						recursivelyFindFile(filename, filePath).then((subPaths) => {
							if (subPaths.length > 0) {
								paths = paths.concat(subPaths);
							}

							if (--numFilesToExamine === 0) {
							resolve(paths);
							}
						})
					} else {
						if (--numFilesToExamine === 0) {
							resolve(paths);
						}
					}
				})
			});
		});
	});
}