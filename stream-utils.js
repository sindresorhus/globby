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

export class UniqueStream extends ObjectTransform {
	constructor(uniqueBy) {
		super();
		this._uniqueBy = uniqueBy;
		this._pushed = new Set();
	}

	_transform(data, encoding, callback) {
		const {_uniqueBy: uniqueBy, _pushed: pushed} = this;
		const key = uniqueBy(data);

		if (!pushed.has(key)) {
			this.push(data);
			pushed.add(key);
		}

		callback();
	}
}
