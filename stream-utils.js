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
	constructor(comparator) {
		super();
		this._comparator = comparator;
		this._pushed = new Set();
	}

	_transform(data, encoding, callback) {
		const {_comparator: comparator, _pushed: pushed} = this;
		const value = comparator(data);

		if (!pushed.has(value)) {
			this.push(data);
			pushed.add(value);
		}

		callback();
	}
}
