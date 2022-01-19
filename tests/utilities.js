import {fileURLToPath, pathToFileURL} from 'node:url';
import util from 'node:util';

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const getPathValues = path => [path, pathToFileURL(path)];
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
];
