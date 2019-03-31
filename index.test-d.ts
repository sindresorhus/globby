import {expectType} from 'tsd';
import globby = require('.');
import {
	GlobTask,
	FilterFunction,
	sync as globbySync,
	generateGlobTasks,
	hasMagic,
	gitignore
} from '.';

// Globby
expectType<Promise<string[]>>(globby('*.tmp'));
expectType<Promise<string[]>>(globby(['a.tmp', '*.tmp', '!{c,d,e}.tmp']));

expectType<Promise<string[]>>(globby('*.tmp', {expandDirectories: false}));
expectType<Promise<string[]>>(
	globby('*.tmp', {expandDirectories: ['a*', 'b*']})
);
expectType<Promise<string[]>>(
	globby('*.tmp', {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		}
	})
);
expectType<Promise<string[]>>(globby('*.tmp', {gitignore: true}));
expectType<Promise<string[]>>(globby('*.tmp', {ignore: ['**/b.tmp']}));

// Globby (sync)
expectType<string[]>(globbySync('*.tmp'));
expectType<string[]>(globbySync(['a.tmp', '*.tmp', '!{c,d,e}.tmp']));

expectType<string[]>(globbySync('*.tmp', {expandDirectories: false}));
expectType<string[]>(globbySync('*.tmp', {expandDirectories: ['a*', 'b*']}));
expectType<string[]>(
	globbySync('*.tmp', {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		}
	})
);
expectType<string[]>(globbySync('*.tmp', {gitignore: true}));
expectType<string[]>(globbySync('*.tmp', {ignore: ['**/b.tmp']}));

// GenerateGlobTasks
expectType<GlobTask[]>(generateGlobTasks('*.tmp'));
expectType<GlobTask[]>(generateGlobTasks(['a.tmp', '*.tmp', '!{c,d,e}.tmp']));

expectType<GlobTask[]>(generateGlobTasks('*.tmp', {expandDirectories: false}));
expectType<GlobTask[]>(
	generateGlobTasks('*.tmp', {expandDirectories: ['a*', 'b*']})
);
expectType<GlobTask[]>(
	generateGlobTasks('*.tmp', {
		expandDirectories: {
			files: ['a', 'b'],
			extensions: ['tmp']
		}
	})
);
expectType<GlobTask[]>(generateGlobTasks('*.tmp', {gitignore: true}));
expectType<GlobTask[]>(generateGlobTasks('*.tmp', {ignore: ['**/b.tmp']}));

// HasMagic
expectType<boolean>(hasMagic('**'));
expectType<boolean>(hasMagic(['**', 'path1', 'path2']));
expectType<boolean>(hasMagic(['**', 'path1', 'path2'], {noext: true}));

// Gitignore
expectType<Promise<FilterFunction>>(gitignore());
expectType<Promise<FilterFunction>>(
	gitignore({
		cwd: __dirname
	})
);
expectType<Promise<FilterFunction>>(
	gitignore({
		ignore: ['**/b.tmp']
	})
);

// Gitignore (sync)
expectType<FilterFunction>(gitignore.sync());
expectType<FilterFunction>(
	gitignore.sync({
		cwd: __dirname
	})
);
expectType<FilterFunction>(
	gitignore.sync({
		ignore: ['**/b.tmp']
	})
);
