import {type Buffer} from 'node:buffer';
import {expectType} from 'tsd';
import {
	type GlobTask,
	type GlobEntry,
	type GlobbyStream,
	type GlobbyFilterFunction,
	globby,
	globbySync,
	globbyStream,
	generateGlobTasks,
	generateGlobTasksSync,
	isDynamicPattern,
	isGitIgnored,
	isGitIgnoredSync,
} from './index.js';

const __dirname = '';

// Globby
expectType<Promise<string[]>>(globby('*.tmp'));
expectType<Promise<string[]>>(globby(['a.tmp', '*.tmp', '!{c,d,e}.tmp']));

expectType<Promise<string[]>>(globby('*.tmp', {expandDirectories: false}));
expectType<Promise<string[]>>(
	globby('*.tmp', {expandDirectories: ['a*', 'b*']}),
);
expectType<Promise<string[]>>(
	globby('*.tmp', {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp'],
		},
	}),
);
expectType<Promise<string[]>>(globby('*.tmp', {gitignore: true}));
expectType<Promise<string[]>>(globby('*.tmp', {ignore: ['**/b.tmp']}));
expectType<Promise<GlobEntry[]>>(globby('*.tmp', {objectMode: true}));

// Globby (sync)
expectType<string[]>(globbySync('*.tmp'));
expectType<string[]>(globbySync(['a.tmp', '*.tmp', '!{c,d,e}.tmp']));

expectType<string[]>(globbySync('*.tmp', {expandDirectories: false}));
expectType<string[]>(globbySync('*.tmp', {expandDirectories: ['a*', 'b*']}));
expectType<string[]>(
	globbySync('*.tmp', {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp'],
		},
	}),
);
expectType<string[]>(globbySync('*.tmp', {gitignore: true}));
expectType<string[]>(globbySync('*.tmp', {ignore: ['**/b.tmp']}));
expectType<GlobEntry[]>(globbySync('*.tmp', {objectMode: true}));

// Globby (stream)
expectType<GlobbyStream>(globbyStream('*.tmp'));
expectType<GlobbyStream>(globbyStream(['a.tmp', '*.tmp', '!{c,d,e}.tmp']));

expectType<GlobbyStream>(globbyStream('*.tmp', {expandDirectories: false}));
expectType<GlobbyStream>(globbyStream('*.tmp', {expandDirectories: ['a*', 'b*']}));
expectType<GlobbyStream>(
	globbyStream('*.tmp', {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp'],
		},
	}),
);
expectType<GlobbyStream>(globbyStream('*.tmp', {gitignore: true}));
expectType<GlobbyStream>(globbyStream('*.tmp', {ignore: ['**/b.tmp']}));

// eslint-disable-next-line unicorn/prefer-top-level-await
(async () => {
	const streamResult = [];
	for await (const path of globbyStream('*.tmp')) {
		streamResult.push(path);
	}

	// With the GlobbyStream interface, we can properly type the result as string[]
	expectType<string[]>(streamResult);
})();

// GenerateGlobTasks
expectType<Promise<GlobTask[]>>(generateGlobTasks('*.tmp'));
expectType<Promise<GlobTask[]>>(generateGlobTasks(['a.tmp', '*.tmp', '!{c,d,e}.tmp']));

expectType<Promise<GlobTask[]>>(generateGlobTasks('*.tmp', {expandDirectories: false}));
expectType<Promise<GlobTask[]>>(
	generateGlobTasks('*.tmp', {expandDirectories: ['a*', 'b*']}),
);
expectType<Promise<GlobTask[]>>(
	generateGlobTasks('*.tmp', {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp'],
		},
	}),
);
expectType<Promise<GlobTask[]>>(generateGlobTasks('*.tmp', {gitignore: true}));
expectType<Promise<GlobTask[]>>(generateGlobTasks('*.tmp', {ignore: ['**/b.tmp']}));

// GenerateGlobTasksSync
expectType<GlobTask[]>(generateGlobTasksSync('*.tmp'));
expectType<GlobTask[]>(generateGlobTasksSync(['a.tmp', '*.tmp', '!{c,d,e}.tmp']));

expectType<GlobTask[]>(generateGlobTasksSync('*.tmp', {expandDirectories: false}));
expectType<GlobTask[]>(
	generateGlobTasksSync('*.tmp', {expandDirectories: ['a*', 'b*']}),
);
expectType<GlobTask[]>(
	generateGlobTasksSync('*.tmp', {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp'],
		},
	}),
);
expectType<GlobTask[]>(generateGlobTasksSync('*.tmp', {gitignore: true}));
expectType<GlobTask[]>(generateGlobTasksSync('*.tmp', {ignore: ['**/b.tmp']}));

// IsDynamicPattern
expectType<boolean>(isDynamicPattern('**'));
expectType<boolean>(isDynamicPattern(['**', 'path1', 'path2']));
expectType<boolean>(isDynamicPattern(['**', 'path1', 'path2'], {extglob: false}));
expectType<boolean>(isDynamicPattern(['**'], {cwd: new URL('file:///path/to/cwd')}));
expectType<boolean>(isDynamicPattern(['**'], {cwd: __dirname}));

// IsGitIgnored
expectType<Promise<GlobbyFilterFunction>>(isGitIgnored());
expectType<Promise<GlobbyFilterFunction>>(
	isGitIgnored({
		cwd: __dirname,
	}),
);
expectType<Promise<GlobbyFilterFunction>>(
	isGitIgnored({
		cwd: new URL('file:///path/to/cwd'),
	}),
);

// IsGitIgnoredSync
expectType<GlobbyFilterFunction>(isGitIgnoredSync());
expectType<GlobbyFilterFunction>(
	isGitIgnoredSync({
		cwd: __dirname,
	}),
);
expectType<GlobbyFilterFunction>(
	isGitIgnoredSync({
		cwd: new URL('file:///path/to/cwd'),
	}),
);
