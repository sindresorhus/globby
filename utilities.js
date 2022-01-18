import {fileURLToPath} from 'node:url';
import {Transform} from 'node:stream';

export const toPath = urlOrPath => urlOrPath instanceof URL ? fileURLToPath(urlOrPath) : urlOrPath;

export class FilterStream extends Transform {
	#filter;

	constructor(filter) {
		super({objectMode: true});
		this.#filter = filter;
	}

	_transform(data, encoding, callback) {
		callback(undefined, this.#filter(data) ? data : undefined);
	}
}
