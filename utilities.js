import {fileURLToPath} from 'node:url';
import {Transform} from 'node:stream';

export const toPath = urlOrPath => urlOrPath instanceof URL ? fileURLToPath(urlOrPath) : urlOrPath;

export class FilterStream extends Transform {
	constructor(filter) {
		super({
			objectMode: true,
			transform(data, encoding, callback) {
				callback(undefined, filter(data) ? data : undefined);
			},
		});
	}
}

const assertPatternsInput = patterns => {
	if (patterns.some(pattern => typeof pattern !== 'string')) {
		throw new TypeError('Patterns must be a string or an array of strings');
	}
};

export const toPatternsArray = patterns => {
	patterns = [...new Set([patterns].flat())];
	assertPatternsInput(patterns);
	return patterns;
};

export const isNegativePattern = pattern => pattern[0] === '!';
