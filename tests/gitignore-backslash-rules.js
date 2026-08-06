import fs from 'node:fs';
import path from 'node:path';
import test from 'ava';
import ignore from 'ignore';
import {temporaryDirectory} from 'tempy';
import {
	globby,
	globbySync,
	isGitIgnored,
	isGitIgnoredSync,
} from '../index.js';

const sorted = files => files.map(String).sort();

// Force the `ignore` package's Windows mode: it rewrites backslashes to slashes only on Windows, and its (always-on) relative-path validation then rejects the result - `\#foo` becomes `/#foo` and `Ignore#ignores()` throws "path should be a `path.relative()`d string". The hook below (exposed by `ignore` for testing) enables that mode so the bug reproduces on every platform; on actual Windows it is a no-op.
//
// The hook mutates the `ignore` module globally with no teardown, which is why these tests live in their own file: AVA runs each test file in its own process, so nothing else is affected.
ignore[Symbol.for('setupWindows')]();

// A .gitignore rule starting with a backslash escape must not crash the glob when the file also contains a negation whose final segment is a glob (`!*.keep`): the rule text was passed to `Ignore#ignores()` as if it were a path. `\#name` is the documented gitignore idiom for names starting with `#`; junk like `\.\NUL` exists in real-world files (for example microsoft/data-formulator).
for (const rule of [String.raw`\#hashname`, String.raw`\.\NUL`, String.raw`\!bang`]) {
	test(`gitignore rule ${rule} beside a wildcard negation`, async t => {
		const cwd = temporaryDirectory();
		fs.writeFileSync(path.join(cwd, '.gitignore'), `${rule}\n!*.keep\n`);
		fs.writeFileSync(path.join(cwd, 'a.keep'), '');

		t.deepEqual(await globby('**/*', {cwd, gitignore: true}), ['a.keep']);
		t.deepEqual(globbySync('**/*', {cwd, gitignore: true}), ['a.keep']);
	});
}

test('escaped gitignore rules still ignore the file they name', async t => {
	const cwd = temporaryDirectory();
	fs.writeFileSync(path.join(cwd, '.gitignore'), '\\#hashname\n!*.keep\n');
	fs.writeFileSync(path.join(cwd, '#hashname'), '');
	fs.writeFileSync(path.join(cwd, 'a.keep'), '');

	t.deepEqual(await globby('**/*', {cwd, gitignore: true}), ['a.keep']);
	t.deepEqual(globbySync('**/*', {cwd, gitignore: true}), ['a.keep']);
});

test('a wildcard negation still rescues a directory ignored by an escaped rule', async t => {
	const cwd = temporaryDirectory();
	fs.writeFileSync(path.join(cwd, '.gitignore'), '\\#build\n!*build\n');
	fs.mkdirSync(path.join(cwd, '#build'));
	fs.writeFileSync(path.join(cwd, '#build', 'a.txt'), '');

	t.deepEqual(await globby('**/*', {cwd, gitignore: true}), ['#build/a.txt']);
	t.deepEqual(globbySync('**/*', {cwd, gitignore: true}), ['#build/a.txt']);
});

// Unescaping does not always yield a usable path: `\.` names `.`, which `Ignore#ignores()` rejects however it is spelled. Such a rule simply cannot be compared, so it must be left unpruned rather than throwing or being skipped on a guess.
for (const rule of [String.raw`\.`, String.raw`\.\.`]) {
	test(`gitignore rule ${rule} unescapes to something that is not a path`, async t => {
		const cwd = temporaryDirectory();
		fs.writeFileSync(path.join(cwd, '.gitignore'), `${rule}\n!*.keep\n`);
		fs.writeFileSync(path.join(cwd, 'a.keep'), '');
		fs.writeFileSync(path.join(cwd, 'b.txt'), '');

		const expected = ['a.keep', 'b.txt'];
		t.deepEqual(sorted(await globby('**/*', {cwd, gitignore: true})), expected);
		t.deepEqual(sorted(globbySync('**/*', {cwd, gitignore: true})), expected);
	});
}

// A rule declared by a nested gitignore is pruned with its own directory as the prefix, which is a separate branch from the cwd-level rules above.
test('escaped rule declared by a nested gitignore', async t => {
	const cwd = temporaryDirectory();
	fs.mkdirSync(path.join(cwd, 'sub', '#build'), {recursive: true});
	fs.writeFileSync(path.join(cwd, 'sub', '.gitignore'), '\\#build\n!*.keep\n');
	fs.writeFileSync(path.join(cwd, 'sub', '#build', 'a.txt'), '');
	fs.writeFileSync(path.join(cwd, 'sub', 'a.keep'), '');
	fs.writeFileSync(path.join(cwd, 'root.txt'), '');

	const expected = ['root.txt', 'sub/a.keep'];
	t.deepEqual(sorted(await globby('**/*', {cwd, gitignore: true})), expected);
	t.deepEqual(sorted(globbySync('**/*', {cwd, gitignore: true})), expected);
});

// The guard names the ignore-file search carries out are rule text as well, so the same comparison runs again - this time against a negation found only once that search has finished.
test('escaped guard name compared against a negation from a discovered gitignore', async t => {
	const cwd = temporaryDirectory();
	fs.mkdirSync(path.join(cwd, '#build'));
	fs.mkdirSync(path.join(cwd, 'sub', '#build'), {recursive: true});
	fs.writeFileSync(path.join(cwd, '.gitignore'), '\\#build\n');
	fs.writeFileSync(path.join(cwd, 'sub', '.gitignore'), '!*build\n');
	fs.writeFileSync(path.join(cwd, '#build', 'a.txt'), '');
	fs.writeFileSync(path.join(cwd, 'sub', '#build', 'b.txt'), '');
	fs.writeFileSync(path.join(cwd, 'app.js'), '');

	// The same fixture is checked against real git by `gitignore-vs-git.js`.
	const expected = ['app.js', 'sub/#build/b.txt'];
	t.deepEqual(sorted(await globby('**/*', {cwd, gitignore: true})), expected);
	t.deepEqual(sorted(globbySync('**/*', {cwd, gitignore: true})), expected);
});

// `isGitIgnored` reaches the same rule comparison without globbing anything, so it has its own way of tripping over an escaped rule.
test('isGitIgnored builds a predicate from escaped rules', async t => {
	const cwd = temporaryDirectory();
	fs.writeFileSync(path.join(cwd, '.gitignore'), '\\#hashname\n!*.keep\n');

	const isIgnored = await isGitIgnored({cwd});
	t.true(isIgnored(path.join(cwd, '#hashname')));
	t.false(isIgnored(path.join(cwd, 'a.keep')));
});

test('isGitIgnoredSync builds a predicate from escaped rules', t => {
	const cwd = temporaryDirectory();
	fs.writeFileSync(path.join(cwd, '.gitignore'), '\\#hashname\n!*.keep\n');

	const isIgnored = isGitIgnoredSync({cwd});
	t.true(isIgnored(path.join(cwd, '#hashname')));
	t.false(isIgnored(path.join(cwd, 'a.keep')));
});
