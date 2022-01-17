import {Transform} from 'node:stream';

class ObjectTransform extends Transform {
	constructor() {
		super({
			objectMode: true,
		});
	}
}

export class FilterStream extends ObjectTransform {
	constructor(filter) {
		super();
		this._filter = filter;
	}

	_transform(data, encoding, callback) {
		if (this._filter(data)) {
			this.push(data);
		}

		callback();
	}
}
