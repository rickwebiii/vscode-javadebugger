export function pollUntil(condition: () => boolean): Promise<{}> {
	return new Promise((resolve, reject) => {
		const callback = () => {
			if (condition()) {
				resolve();
			}

			setTimeout(callback, 1);
		}

		callback();
	});
}