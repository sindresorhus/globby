import {Options as FastGlobOptions, Entry as FastGlobEntry} from 'fast-glob';

type ExpandDirectoriesOption =
	| boolean
	| readonly string[]
	| {files?: readonly string[]; extensions?: readonly string[]};

type GlobbyEntry = FastGlobEntry;

interface GlobbyOptions extends FastGlobOptions {
	/**
		If set to `true`, `globby` will automatically glob directories for you. If you define an `Array` it will only glob files that matches the patterns inside the `Array`. You can also define an `Object` with `files` and `extensions` like in the example below.

		Note that if you set this option to `false`, you won't get back matched directories unless you set `onlyFiles: false`.

		@default true

		@example
		```
		import {globby} from 'globby';

		(async () => {
			const paths = await globby('images', {
				expandDirectories: {
					files: ['cat', 'unicorn', '*.jpg'],
					extensions: ['png']
				}
			});

			console.log(paths);
			//=> ['cat.png', 'unicorn.png', 'cow.jpg', 'rainbow.jpg']
		})();
		```
	 */
	readonly expandDirectories?: ExpandDirectoriesOption;

	/**
		Respect ignore patterns in `.gitignore` files that apply to the globbed files.

		@default false
	 */
	readonly gitignore?: boolean;
}

interface GlobTask {
	readonly pattern: string;
	readonly options: GlobbyOptions;
}

interface GitignoreOptions {
	readonly cwd?: string;
	readonly ignore?: readonly string[];
}

type GlobbyFilterFunction = (path: string) => boolean;

/**
	`.gitignore` files matched by the ignore config are not used for the resulting filter function.

	@returns A filter function indicating whether a given path is ignored via a `.gitignore` file.

	@example
	```
	import {isGitIgnored} from 'globby';

	(async () => {
		const isIgnored = await isGitIgnored();
		console.log(isIgnored('some/file'));
	})();
	```
 */
declare const isGitIgnored: (options?: GitignoreOptions) => Promise<GlobbyFilterFunction>;

/**
	@returns A filter function indicating whether a given path is ignored via a `.gitignore` file.
 */
declare const isGitIgnoredSync: (options?: GitignoreOptions) => GlobbyFilterFunction;

/**
	Find files and directories using glob patterns.

	Note that glob patterns can only contain forward-slashes, not backward-slashes, so if you want to construct a glob pattern from path components, you need to use `path.posix.join()` instead of `path.join()`.

	@param patterns - See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).
	@param options - See the [`fast-glob` options](https://github.com/mrmlnc/fast-glob#options-3) in addition to the ones in this package.
	@returns The matching paths.
 */
declare const globbySync: ((
	patterns: string | readonly string[],
	options: GlobbyOptions & {objectMode: true}
) => GlobbyEntry[]) & ((
	patterns: string | readonly string[],
	options?: GlobbyOptions
) => string[]);

/**
	Find files and directories using glob patterns.

	Note that glob patterns can only contain forward-slashes, not backward-slashes, so if you want to construct a glob pattern from path components, you need to use `path.posix.join()` instead of `path.join()`.

	@param patterns - See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).
	@param options - See the [`fast-glob` options](https://github.com/mrmlnc/fast-glob#options-3) in addition to the ones in this package.
	@returns The stream of matching paths.

	@example
	```
	import {globbyStream} from 'globby';

	(async () => {
		for await (const path of globbyStream('*.tmp')) {
			console.log(path);
		}
	})();
	```
 */
declare const globbyStream: (
	patterns: string | readonly string[],
	options?: GlobbyOptions
) => NodeJS.ReadableStream;

/**
	Note that you should avoid running the same tasks multiple times as they contain a file system cache. Instead, run this method each time to ensure file system changes are taken into consideration.

	@param patterns - See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).
	@param options - See the [`fast-glob` options](https://github.com/mrmlnc/fast-glob#options-3) in addition to the ones in this package.
	@returns An object in the format `{pattern: string, options: object}`, which can be passed as arguments to [`fast-glob`](https://github.com/mrmlnc/fast-glob). This is useful for other globbing-related packages.
 */
declare const generateGlobTasks: (
	patterns: string | readonly string[],
	options?: GlobbyOptions
) => GlobTask[];

/**
	Note that the options affect the results.

	This function is backed by [`fast-glob`](https://github.com/mrmlnc/fast-glob#isdynamicpatternpattern-options).

	@param patterns - See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).
	@param options - See the [`fast-glob` options](https://github.com/mrmlnc/fast-glob#options-3).
	@returns Whether there are any special glob characters in the `patterns`.
 */
declare const isDynamicPattern: (
	patterns: string | readonly string[],
	options?: FastGlobOptions
) => boolean;

declare const globbyAsync: {
	(
		patterns: string | readonly string[],
		options: GlobbyOptions & {objectMode: true}
	): Promise<GlobbyEntry[]>;

	/**
	Find files and directories using glob patterns.

	Note that glob patterns can only contain forward-slashes, not backward-slashes, so if you want to construct a glob pattern from path components, you need to use `path.posix.join()` instead of `path.join()`.

	@param patterns - See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).
	@param options - See the [`fast-glob` options](https://github.com/mrmlnc/fast-glob#options-3) in addition to the ones in this package.
	@returns The matching paths.

	@example
	```
	import {globby} from 'globby';

	(async () => {
		const paths = await globby(['*', '!cake']);

		console.log(paths);
		//=> ['unicorn', 'rainbow']
	})();
	```
	*/
	(
		patterns: string | readonly string[],
		options?: GlobbyOptions
	): Promise<string[]>;
};

export const globby: typeof globbyAsync;
