import fs from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));

export const getPathValues = path => [path, pathToFileURL(path)];

export const createContextAwareFs = () => {
	const customFs = {
		...fs,
	};

	const customPromises = {
		...fs.promises,
		readFile(...args) {
			if (this !== customPromises) {
				throw new Error('Detached promises.readFile context');
			}

			return fs.promises.readFile(...args);
		},
		stat(...args) {
			if (this !== customPromises) {
				throw new Error('Detached promises.stat context');
			}

			return fs.promises.stat(...args);
		},
	};

	customFs.promises = customPromises;

	customFs.stat = async function (...args) {
		if (this !== customFs) {
			throw new Error('Detached stat context');
		}

		return fs.promises.stat(...args);
	};

	customFs.statSync = function (...args) {
		if (this !== customFs) {
			throw new Error('Detached statSync context');
		}

		return fs.statSync(...args);
	};

	customFs.readFileSync = function (...args) {
		if (this !== customFs) {
			throw new Error('Detached readFileSync context');
		}

		return fs.readFileSync(...args);
	};

	return customFs;
};

export const invalidPatterns = [
	{},
	[{}],
	true,
	[true],
	false,
	[false],
	null,
	[null],
	undefined,
	[undefined],
	Number.NaN,
	[Number.NaN],
	5,
	[5],
	function () {},
	[function () {}],
	[['string']],
];

export const isUnique = array => new Set(array).size === array.length;
