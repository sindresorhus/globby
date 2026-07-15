import {execFileSync} from 'node:child_process';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'ava';
import {temporaryDirectory} from 'tempy';
import {globby, globbySync, globbyStream} from '../index.js';

// Git must see exactly what globby sees: only the repository's own ignore files.
// Neutralize system/global config and the default user ignore file so the oracle is
// deterministic on any machine (globby does not read those unless `globalGitignore` is set).
const isolatedHome = temporaryDirectory();
const gitEnvironment = {
	...process.env,
	HOME: isolatedHome,
	XDG_CONFIG_HOME: isolatedHome,
	GIT_CONFIG_GLOBAL: '/dev/null',
	GIT_CONFIG_SYSTEM: '/dev/null',
};

const git = (arguments_, cwd) => execFileSync('git', arguments_, {
	cwd,
	encoding: 'utf8',
	env: gitEnvironment,
});

const writeFile = (cwd, filePath, content) => {
	const fullPath = path.join(cwd, filePath);
	fs.mkdirSync(path.dirname(fullPath), {recursive: true});
	fs.writeFileSync(fullPath, content);
};

const createRepository = ({gitignore, files = [], directories = []}) => {
	const cwd = temporaryDirectory();
	git(['init', '-q'], cwd);

	const ignoreFiles = typeof gitignore === 'string' ? {'.gitignore': gitignore} : gitignore;
	for (const [filePath, content] of Object.entries(ignoreFiles)) {
		writeFile(cwd, filePath, content);
	}

	for (const directory of directories) {
		fs.mkdirSync(path.join(cwd, directory), {recursive: true});
	}

	for (const file of files) {
		writeFile(cwd, file, '');
	}

	return cwd;
};

// The oracle: exactly the files git itself considers present and not ignored.
const gitLsFiles = cwd => git(['ls-files', '--others', '--exclude-standard'], cwd)
	.split('\n')
	.filter(Boolean);

const relevant = files => files
	.map(String)
	.filter(file => !file.startsWith('.git/') && !file.endsWith('.gitignore'))
	.sort();

/**
Assert globby (async, sync and stream) returns exactly what `git ls-files` reports.
*/
const matchesGit = test.macro({
	async exec(t, fixture) {
		const cwd = createRepository(fixture);
		const expected = relevant(gitLsFiles(cwd));
		const options = {cwd, gitignore: true, dot: true};

		t.deepEqual(relevant(await globby('**/*', options)), expected, 'globby() differs from `git ls-files`');
		t.deepEqual(relevant(globbySync('**/*', options)), expected, 'globbySync() differs from `git ls-files`');
		t.deepEqual(relevant(await globbyStream('**/*', options).toArray()), expected, 'globbyStream() differs from `git ls-files`');
	},
	title: providedTitle => `matches \`git ls-files\`: ${providedTitle}`,
});

// Cases the traversal-pruning optimization must get right. An ignored directory may only be
// skipped wholesale when nothing inside it can be re-included; skipping too much silently
// drops files.

test('ignored directory, with an unrelated negation present', matchesGit, {
	gitignore: 'build/\n*.log\n!keep.log\n',
	files: ['app.js', 'keep.log', 'debug.log', 'build/out.js', 'build/nested/deep.js'],
});

test('negation cannot re-include beneath an ignored directory', matchesGit, {
	gitignore: 'build/\n!build/keep.js\n',
	files: ['app.js', 'build/keep.js', 'build/out.js'],
});

test('negation re-includes when only the directory contents are ignored', matchesGit, {
	gitignore: 'build/*\n!build/keep.js\n',
	files: ['app.js', 'build/keep.js', 'build/out.js'],
});

test('nested gitignore inside a directory whose contents are ignored', matchesGit, {
	gitignore: {
		'.gitignore': 'foo/*\n',
		'foo/.gitignore': '!keep.js\n',
	},
	files: ['app.js', 'foo/keep.js', 'foo/drop.js'],
});

test('nested gitignore inside a directory matched by a globstar contents rule', matchesGit, {
	gitignore: {
		'.gitignore': 'foo/**\n',
		'foo/.gitignore': '!keep.js\n',
	},
	files: ['app.js', 'foo/keep.js', 'foo/drop.js'],
});

// Unlike the `foo/*` and `foo/**` cases above, a full directory rule (`dist/`) excludes the
// directory itself, so git never reads `dist/.gitignore` and its negation cannot rescue anything.
test('nested gitignore inside a fully-ignored directory cannot rescue files', matchesGit, {
	gitignore: {
		'.gitignore': 'dist/\n',
		'dist/.gitignore': '!keep.js\n',
	},
	files: ['app.js', 'dist/keep.js', 'dist/drop.js'],
});

test('nested gitignore remains discoverable with mixed ignore-file search', async t => {
	const cwd = createRepository({
		gitignore: {
			'.gitignore': 'foo/*\n',
			'foo/.gitignore': '!keep.js\n',
		},
		files: ['app.js', 'foo/keep.js', 'foo/drop.js'],
	});
	writeFile(cwd, '.customignore', '');

	const options = {
		cwd,
		gitignore: true,
		ignoreFiles: '**/.customignore',
		dot: true,
	};
	const expected = relevant(gitLsFiles(cwd));

	t.deepEqual(relevant(await globby('**/*', options)), expected);
	t.deepEqual(relevant(globbySync('**/*', options)), expected);
	t.deepEqual(relevant(await globbyStream('**/*', options).toArray()), expected);
});

test('directory un-ignored by a later negation', matchesGit, {
	gitignore: 'temp/\n!temp/\n',
	files: ['app.js', 'temp/file.js'],
});

test('re-included subdirectory of an ignored directory', matchesGit, {
	gitignore: 'node_modules/*\n!node_modules/custom/\n',
	files: ['index.js', 'node_modules/react/index.js', 'node_modules/custom/index.js', 'node_modules/custom/lib/deep.js'],
});

test('bare directory name without trailing slash', matchesGit, {
	gitignore: 'dist\n!dist/keep.js\n',
	files: ['app.js', 'dist/keep.js', 'dist/out.js'],
});

test('anchored directory pattern', matchesGit, {
	gitignore: '/build\n',
	files: ['build/out.js', 'src/build/keep.js', 'app.js'],
});

test('anchored directory pattern with trailing slash', matchesGit, {
	gitignore: '/build/\n',
	files: ['build/out.js', 'src/build/keep.js', 'app.js'],
});

// A separator anchors the rule to the .gitignore's directory, and the `**` in the middle must
// stay a wildcard segment when the rule is resolved into a cwd-relative prune pattern.
test('anchored directory pattern with a mid-pattern globstar', matchesGit, {
	gitignore: 'src/**/cache/\n',
	files: ['app.js', 'src/a/cache/out.js', 'src/b/c/cache/data.js', 'other/cache/keep.js'],
});

test('nested gitignore ignores a directory', matchesGit, {
	gitignore: {
		'.gitignore': '*.log\n',
		'src/.gitignore': 'generated/\n!important.log\n',
	},
	files: ['app.log', 'src/app.js', 'src/important.log', 'src/generated/a.js', 'src/generated/deep/b.js'],
});

test('nested gitignore re-includes a file ignored by the root', matchesGit, {
	gitignore: {
		'.gitignore': '*.log\n',
		'src/.gitignore': '!keep.log\n',
	},
	files: ['root.log', 'src/keep.log', 'src/other.log', 'src/app.js'],
});

test('dotfiles and negation', matchesGit, {
	gitignore: '.*\n!.env.example\n',
	files: ['.env', '.env.example', 'app.js'],
});

test('everything ignored except one file', matchesGit, {
	gitignore: '*\n!keep.js\n',
	files: ['keep.js', 'drop.js', 'sub/deep.js'],
});

test('deeply nested ignored directory', matchesGit, {
	gitignore: 'vendor/\n',
	files: ['app.js', 'vendor/a/b/c/d/e.js', 'vendor/x.js'],
});

test('ignored directory sharing a name with a kept one', matchesGit, {
	gitignore: '/cache/\n',
	files: ['cache/a.js', 'src/cache/b.js', 'app.js'],
});

// Running from a subdirectory of the repository (e.g. a monorepo package). The rules come from
// the .gitignore above the cwd, and must still be understood relative to it.
const createMonorepo = () => {
	const root = createRepository({
		gitignore: 'node_modules/\n*.log\n!keep.log\n',
		files: ['packages/app/src/index.js', 'packages/app/keep.log', 'packages/app/drop.log'],
	});
	const cwd = path.join(root, 'packages', 'app');
	writeFile(cwd, 'node_modules/react/index.js', '');
	writeFile(cwd, 'node_modules/react/lib/deep.js', '');
	return cwd;
};

test('matches `git ls-files` from a subdirectory of the repository', async t => {
	const cwd = createMonorepo();
	const expected = relevant(gitLsFiles(cwd)).map(file => path.posix.normalize(file));
	const options = {cwd, gitignore: true, dot: true};

	t.deepEqual(relevant(await globby('**/*', options)), expected);
	t.deepEqual(relevant(globbySync('**/*', options)), expected);
	t.deepEqual(relevant(await globbyStream('**/*', options).toArray()), expected);
	t.true(expected.includes('keep.log'), 'the negated file must survive');
	t.false(expected.some(file => file.startsWith('node_modules/')), 'git ignores node_modules');
});

// Matching git is necessary but not sufficient: an ignored directory must never be read at
// all. Finding the ignore files must not itself walk the directories they exclude, or a large
// ignored directory (a mounted share) is enumerated on every call.

const countReadsInside = ignoredDirectory => {
	const readDirectories = [];
	const record = directory => {
		readDirectories.push(path.resolve(String(directory)));
	};

	const instrumentedFs = {
		...fs,
		readdir(...arguments_) {
			record(arguments_[0]);
			// eslint-disable-next-line n/prefer-promises/fs -- fast-glob uses the callback API, which is what needs instrumenting.
			return fs.readdir(...arguments_);
		},
		readdirSync(...arguments_) {
			record(arguments_[0]);
			return fs.readdirSync(...arguments_);
		},
	};

	const prefix = ignoredDirectory + path.sep;
	return {
		fs: instrumentedFs,
		readInside: () => readDirectories.some(directory => directory === ignoredDirectory || directory.startsWith(prefix)),
	};
};

test('an ignored directory is never read from a subdirectory of the repository', async t => {
	const cwd = createMonorepo();
	const {fs: instrumentedFs, readInside} = countReadsInside(path.join(cwd, 'node_modules'));

	const files = await globby('**/*', {
		cwd,
		gitignore: true,
		dot: true,
		fs: instrumentedFs,
	});

	t.deepEqual(relevant(files), relevant(gitLsFiles(cwd)));
	t.false(readInside(), 'globby read the contents of an ignored directory');
});

test('an ignored directory is never read', async t => {
	const cwd = createRepository({
		// A negation is present, which is the case that previously disabled all pruning.
		gitignore: 'mount/\n*.log\n!keep.log\n',
		files: ['app.js', 'keep.log', 'mount/a.js', 'mount/deep/b.js'],
	});

	const {fs: instrumentedFs, readInside} = countReadsInside(path.join(cwd, 'mount'));

	const files = await globby('**/*', {
		cwd,
		gitignore: true,
		dot: true,
		fs: instrumentedFs,
	});

	t.deepEqual(relevant(files), relevant(gitLsFiles(cwd)));
	t.false(readInside(), 'globby read the contents of an ignored directory');
});

// The sync path prunes independently of the async one, so the no-read invariant needs its own check.
test('an ignored directory is never read (sync)', t => {
	const cwd = createRepository({
		gitignore: 'mount/\n*.log\n!keep.log\n',
		files: ['app.js', 'keep.log', 'mount/a.js', 'mount/deep/b.js'],
	});

	const {fs: instrumentedFs, readInside} = countReadsInside(path.join(cwd, 'mount'));

	const files = globbySync('**/*', {
		cwd,
		gitignore: true,
		dot: true,
		fs: instrumentedFs,
	});

	t.deepEqual(relevant(files), relevant(gitLsFiles(cwd)));
	t.false(readInside(), 'globbySync read the contents of an ignored directory');
});

test('a directory ignored by an explicit `**/` prefix is never read', async t => {
	const cwd = createRepository({
		// `**/mount/` is gitignore's explicit "at any depth" spelling of `mount/`, and the
		// unrelated negation must not stop it from being pruned during traversal.
		gitignore: '**/mount/\n*.log\n!keep.log\n',
		files: ['app.js', 'keep.log', 'mount/a.js', 'mount/deep/b.js'],
	});

	const {fs: instrumentedFs, readInside} = countReadsInside(path.join(cwd, 'mount'));

	const files = await globby('**/*', {
		cwd,
		gitignore: true,
		dot: true,
		fs: instrumentedFs,
	});

	t.deepEqual(relevant(files), relevant(gitLsFiles(cwd)));
	t.false(readInside(), 'globby read the contents of an ignored directory');
});

test('negation re-includes a deeper directory of the same name', matchesGit, {
	gitignore: 'mount/\n!sub/mount/\n',
	files: ['app.js', 'mount/a.js', 'sub/mount/b.js'],
});

// A glob on either side must still be compared, not assumed safe.

test('glob directory pattern with an unrelated negation', matchesGit, {
	gitignore: '*cache/\n!keep.log\n',
	files: ['app.js', 'keep.log', 'bigcache/a.js', 'bigcache/deep/b.js'],
});

test('glob directory pattern negated by name', matchesGit, {
	gitignore: '*cache/\n!bigcache/\n',
	files: ['app.js', 'bigcache/a.js', 'othercache/b.js'],
});

test('literal directory with an unrelated glob negation', matchesGit, {
	gitignore: 'node_modules/\n!*.keep\n',
	files: ['app.js', 'x.keep', 'node_modules/react/index.js'],
});

test('literal directory negated by a glob that names it', matchesGit, {
	gitignore: 'mount/\n!mo*/\n',
	files: ['app.js', 'mount/a.js'],
});

test('glob file pattern negated by name', matchesGit, {
	gitignore: '*.log\n!keep.log\n',
	files: ['app.js', 'keep.log', 'drop.log', 'sub/keep.log', 'sub/drop.log'],
});

test('glob directory pattern negated by another glob', matchesGit, {
	gitignore: '*cache/\n!big*/\n',
	files: ['app.js', 'bigcache/a.js', 'othercache/b.js'],
});

// The pruned search for ignore files must notice when a later negation re-includes a directory
// it skipped, since the ignore files inside that directory were never discovered.

test('nested gitignore inside a re-included directory', matchesGit, {
	gitignore: {
		'.gitignore': 'mount/\n',
		'sub/.gitignore': '!mount/\n',
		'sub/mount/.gitignore': 'secret/\n',
	},
	files: ['app.js', 'sub/mount/ok.js', 'sub/mount/secret/x.js'],
});

test('negation inside a re-included directory', matchesGit, {
	gitignore: {
		'.gitignore': 'mount/\n*.log\n',
		'sub/.gitignore': '!mount/\n',
		'sub/mount/.gitignore': '!keep.log\n',
	},
	files: ['app.js', 'sub/mount/keep.log', 'sub/mount/other.log'],
});

test('anchored directory re-included by a deeper negation', matchesGit, {
	gitignore: {
		'.gitignore': 'sub/build/\n*.log\n',
		'sub/.gitignore': '!build/\n',
		'sub/build/.gitignore': '!keep.log\n',
	},
	files: ['app.js', 'sub/build/keep.log', 'sub/build/out.log'],
});

// A re-included directory can itself ignore a directory that a still-deeper file re-includes.
// The unpruned rescan runs only once, so this confirms a single pass discovers every level.
test('multi-level re-include chain resolved by one unpruned pass', matchesGit, {
	gitignore: {
		'.gitignore': 'level1/\n',
		'sub/.gitignore': '!level1/\n',
		'sub/level1/.gitignore': 'level2/\n',
		'sub/level1/sub2/.gitignore': '!level2/\n',
	},
	files: ['app.js', 'sub/level1/ok.js', 'sub/level1/level2/secret.js', 'sub/level1/sub2/level2/keep.js'],
});

// Trailing whitespace is stripped unless backslash-escaped, both in rules and in the negations
// that decide whether a directory may be skipped.

test('rule with trailing whitespace', matchesGit, {
	gitignore: 'build \n',
	files: ['app.js', 'build/out.js'],
});

test('negation with trailing whitespace', matchesGit, {
	gitignore: 'keep/\n!keep \n',
	files: ['app.js', 'keep/a.js'],
});

// A backslash-escaped trailing space is kept, so the rule names a file that literally ends in a space.
test('rule with a backslash-escaped trailing space', matchesGit, {
	gitignore: 'keep\\ \n',
	files: ['app.js', 'keep ', 'keepX'],
});

// A leading `\!` is an escaped literal, so the rule ignores a directory named `!secret` rather
// than acting as a negation. The directory is still pruned safely.
test('backslash-escaped leading ! is a literal rule, not a negation', matchesGit, {
	gitignore: '\\!secret/\n',
	files: ['app.js', '!secret/data.js', 'safe/keep.js'],
});

// A byte order mark and CRLF line endings, common in files authored on Windows, are read the
// way git reads them.
test('gitignore with a leading byte order mark', matchesGit, {
	gitignore: '\uFEFFbuild/\n*.log\n',
	files: ['app.js', 'build/out.js', 'debug.log'],
});

test('gitignore with CRLF line endings', matchesGit, {
	gitignore: 'build/\r\n*.log\r\n!keep.log\r\n',
	files: ['app.js', 'keep.log', 'drop.log', 'build/out.js', 'build/nested/deep.js'],
});

// In gitignore, characters like `+()` and `{}` are literal; micromatch reads them as syntax.
// Neither a rule nor a directory on the way to one may be misread.

test('rule naming a literal extglob-like directory', matchesGit, {
	gitignore: '/a+(b)/\n',
	files: ['app.js', 'a+(b)/ignored.js', 'ab/kept.js', 'abb/kept.js'],
});

test('bare rule naming a literal extglob-like directory', matchesGit, {
	gitignore: 'a+(b)\n',
	files: ['app.js', 'a+(b)/ignored.js', 'ab/kept.js', 'sub/abb/kept.js'],
});

test('rule naming a literal braces-like directory', matchesGit, {
	gitignore: '/{src,dist}/\n',
	files: ['app.js', '{src,dist}/ignored.js', 'src/kept.js', 'dist/kept.js'],
});

test('directory name containing micromatch syntax', matchesGit, {
	gitignore: {
		'lib+(v2)/.gitignore': 'node_modules/\n',
	},
	files: ['app.js', 'libv2/node_modules/x.js', 'lib+(v2)/node_modules/y.js', 'lib+(v2)/src.js'],
});

// `?` and `[...]` are wildcards gitignore shares with fast-glob, so a directory named by one is
// still pruned safely, unlike the literal `+()`/`{}` cases above.

test('single-character wildcard directory pattern', matchesGit, {
	gitignore: 'bui?d/\n',
	files: ['app.js', 'build/out.js', 'buiXd/deep/a.js'],
});

test('character-class directory pattern', matchesGit, {
	gitignore: '[bc]ache/\n',
	files: ['app.js', 'bache/a.js', 'cache/b.js', 'dache/keep.js'],
});

// An explicit `**/` prefix is legal and equivalent to a bare directory name.
test('directory rule with an explicit globstar prefix', matchesGit, {
	gitignore: '**/generated/\n',
	files: ['app.js', 'generated/a.js', 'src/generated/b.js'],
});

// Prune patterns are scoped to the cwd their rules were resolved against. A task that reaches
// outside the cwd through `../` must not inherit them.
test('prune patterns do not leak into parent-directory tasks', async t => {
	const root = createRepository({
		gitignore: {
			'a/.gitignore': 'mount/\n',
		},
		files: ['a/app.js', 'b/mount/file.js', 'b/other.js'],
	});
	const cwd = path.join(root, 'a');
	const options = {cwd, gitignore: true, dot: true};
	const expected = ['../b/mount/file.js', '../b/other.js'];

	const files = await globby('../b/**', options);
	t.deepEqual(files.map(String).sort(), expected);
	t.deepEqual(globbySync('../b/**', options).map(String).sort(), expected);
});

// A custom ignore file is not read until the search runs, so a negation in one can re-include
// a directory that the already-known gitignore rules would have pruned.
test('custom ignore file can re-include a directory skipped by the search', async t => {
	const cwd = createRepository({
		gitignore: 'build/\n',
		files: ['app.js', 'build/keep.js', 'build/out.js'],
	});
	writeFile(cwd, '.customignore', '!build/\n');
	writeFile(cwd, 'build/.customignore', 'out.js\n');

	const options = {
		cwd,
		gitignore: true,
		ignoreFiles: '**/.customignore',
		dot: true,
	};
	const expected = ['app.js', 'build/keep.js'];
	const clean = files => relevant(files).filter(file => !file.endsWith('.customignore'));

	t.deepEqual(clean(await globby('**/*', options)), expected);
	t.deepEqual(clean(globbySync('**/*', options)), expected);
});
