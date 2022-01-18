import {fileURLToPath} from 'node:url';
import {Transform} from 'node:stream';

export const toPath = urlOrPath => {
	if (!urlOrPath) {
		return urlOrPath;
	}

	if (urlOrPath instanceof URL) {
		urlOrPath = urlOrPath.href;
	}

	return urlOrPath.startsWith('file://') ? fileURLToPath(urlOrPath) : urlOrPath;
};

export class FilterStream extends Transform {
	#filter;

	constructor(filter) {
		super({objectMode: true});
		this.#filter = filter;
	}

	_transform(data, encoding, callback) {
		if (this.#filter(data)) {
			this.push(data);
		}

		callback();
	}
}
