import {execSync} from 'node:child_process';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'ava';
import {globby, globbySync, globbyStream} from '../index.js';

const testRoot = '/tmp/claude/gitignore-tests';

// Declarative test format for simplicity
const runGitignoreTest = async (t, {gitignore, files, directories = []}) => {
	const testDir = path.join(testRoot, t.title.replaceAll(/[^\w-]/g, '-'));

	// Clean and setup
	if (fs.existsSync(testDir)) {
		fs.rmSync(testDir, {recursive: true});
	}

	fs.mkdirSync(testDir, {recursive: true});

	// Create directory structure
	const dirSet = new Set(directories);
	for (const dir of directories) {
		fs.mkdirSync(path.join(testDir, dir), {recursive: true});
	}

	// Create files (skip if it's actually a directory)
	for (const file of files) {
		if (dirSet.has(file)) {
			continue; // Skip directories in the files array
		}

		const filePath = path.join(testDir, file);
		fs.mkdirSync(path.dirname(filePath), {recursive: true});
		fs.writeFileSync(filePath, '');
	}

	// Create .gitignore file(s)
	if (typeof gitignore === 'string') {
		fs.writeFileSync(path.join(testDir, '.gitignore'), gitignore);
	} else {
		// Support multiple .gitignore files: {path: content}
		for (const [gitignorePath, content] of Object.entries(gitignore)) {
			fs.writeFileSync(path.join(testDir, gitignorePath), content);
		}
	}

	// Initialize Git
	const originalCwd = process.cwd();
	process.chdir(testDir);
	try {
		execSync('git init -q', {stdio: 'pipe'});
	} finally {
		process.chdir(originalCwd);
	}

	// Get Git's view of untracked files
	let gitFiles;
	process.chdir(testDir);
	try {
		const gitOutput = execSync('git status --porcelain -uall', {encoding: 'utf8'});
		gitFiles = gitOutput
			.split('\n')
			.filter(line => line.startsWith('??'))
			.map(line => line.slice(3).trim())
			.filter(f => f && !f.endsWith('.gitignore'))
			.sort();
	} finally {
		process.chdir(originalCwd);
	}

	// Get globby's view (with dot:true to match Git's behavior)
	const options = {cwd: testDir, gitignore: true, dot: true};
	const isRelevantFile = f => !f.startsWith('.git/') && !f.endsWith('.gitignore');

	const globbyFilesRaw = await globby('**/*', options);
	const globbyFiles = globbyFilesRaw.filter(f => isRelevantFile(f)).sort();

	const globbySyncFiles = globbySync('**/*', options).filter(f => isRelevantFile(f)).sort();

	const globbyStreamFiles = [];
	for await (const file of globbyStream('**/*', options)) {
		if (isRelevantFile(file)) {
			globbyStreamFiles.push(file);
		}
	}

	globbyStreamFiles.sort();

	// Verify all three methods match Git
	t.deepEqual(globbyFiles, gitFiles, 'globby async matches Git');
	t.deepEqual(globbySyncFiles, gitFiles, 'globbySync matches Git');
	t.deepEqual(globbyStreamFiles, gitFiles, 'globbyStream matches Git');
};

// Basic patterns
test('simple file extension pattern', runGitignoreTest, {
	gitignore: '*.log',
	files: ['app.js', 'test.log', 'debug.log', 'src/index.js', 'src/error.log'],
});

test('simple directory name', runGitignoreTest, {
	gitignore: 'node_modules',
	files: ['index.js', 'node_modules/pkg/index.js', 'node_modules/pkg/lib/utils.js'],
});

test('directory with trailing slash', runGitignoreTest, {
	gitignore: 'build/',
	files: ['index.js', 'build/output.js', 'build/assets/style.css'],
});

test('wildcard in filename', runGitignoreTest, {
	gitignore: 'test-*.js',
	files: ['app.js', 'test-unit.js', 'test-integration.js', 'testing.js'],
});

test('question mark wildcard', runGitignoreTest, {
	gitignore: 'test?.js',
	files: ['test1.js', 'test2.js', 'testA.js', 'test12.js', 'test.js'],
});

test('character class', runGitignoreTest, {
	gitignore: 'test[0-9].js',
	files: ['test0.js', 'test5.js', 'test9.js', 'testA.js', 'test.js'],
});

// Note: Brace expansion is not standard gitignore - removing this test

// Anchored patterns
test('leading slash anchors to root', runGitignoreTest, {
	gitignore: '/build',
	files: ['build/output.js', 'src/build/temp.js', 'docs/build/index.html'],
});

test('pattern with slash in middle', runGitignoreTest, {
	gitignore: 'src/temp',
	files: ['src/temp', 'src/app.js', 'lib/temp', 'temp'],
});

// Patterns matching at any level
test('pattern without slash matches recursively', runGitignoreTest, {
	gitignore: 'temp',
	files: ['temp', 'src/temp', 'src/lib/temp', 'tests/fixtures/temp', 'app.js'],
});

test('pattern with trailing slash only matches directories', runGitignoreTest, {
	gitignore: 'temp/',
	files: ['temp/file.js', 'src/temp/data.js', 'app.js'],
	directories: ['temp', 'src/temp'],
});

// Double asterisk patterns
test('double asterisk in middle', runGitignoreTest, {
	gitignore: '**/temp/**',
	files: ['src/temp/file.js', 'lib/temp/data/info.json', 'temp/test.js', 'app.js'],
});

test('double asterisk with extension', runGitignoreTest, {
	gitignore: '**/*.log',
	files: ['app.log', 'src/debug.log', 'src/lib/error.log', 'index.js'],
});

// Negation patterns
test('simple negation', runGitignoreTest, {
	gitignore: '*.log\n!important.log',
	files: ['app.log', 'important.log', 'debug.log', 'index.js'],
});

test('multiple negations', runGitignoreTest, {
	gitignore: '*.log\n!important.log\n!debug.log',
	files: ['app.log', 'important.log', 'debug.log', 'error.log'],
});

test('negation order matters', runGitignoreTest, {
	gitignore: '*.log\n!important.log\nimportant-test.log',
	files: ['app.log', 'important.log', 'important-test.log'],
});

test('negation with wildcard for directory', runGitignoreTest, {
	gitignore: 'node_modules/*\n!node_modules/custom-pkg/',
	files: ['node_modules/react/index.js', 'node_modules/custom-pkg/index.js', 'node_modules/custom-pkg/lib/utils.js', 'index.js'],
});

test('negation without wildcard does not re-include', runGitignoreTest, {
	gitignore: 'node_modules\n!node_modules/custom-pkg',
	files: ['node_modules/react/index.js', 'node_modules/custom-pkg/index.js', 'index.js'],
});

test('nested negations', runGitignoreTest, {
	gitignore: 'build/*\n!build/assets/\nbuild/assets/*.cache',
	files: ['build/output.js', 'build/assets/style.css', 'build/assets/app.cache', 'build/cache/data.json'],
});

// Multiple .gitignore files
test('subdirectory gitignore', runGitignoreTest, {
	gitignore: {
		'.gitignore': '*.log',
		'src/.gitignore': '*.tmp',
	},
	files: ['app.log', 'index.js', 'src/test.tmp', 'src/app.js', 'src/debug.log'],
});

test('subdirectory gitignore with negation', runGitignoreTest, {
	gitignore: {
		'.gitignore': '*.log',
		'src/.gitignore': '!important.log',
	},
	files: ['app.log', 'src/test.log', 'src/important.log', 'src/app.js'],
});

test('deeply nested gitignore files', runGitignoreTest, {
	gitignore: {
		'.gitignore': '*.log',
		'src/.gitignore': '*.tmp',
		'src/lib/.gitignore': '*.cache',
	},
	files: ['app.log', 'src/test.tmp', 'src/app.js', 'src/lib/data.cache', 'src/lib/index.js'],
});

// Real-world scenarios
test('typical node_modules ignore', runGitignoreTest, {
	gitignore: 'node_modules/',
	files: ['index.js', 'package.json', 'node_modules/react/index.js', 'node_modules/react/lib/React.js', 'node_modules/lodash/index.js'],
});

test('node_modules with exception', runGitignoreTest, {
	gitignore: 'node_modules/*\n!node_modules/custom-pkg/',
	files: ['node_modules/custom-pkg/index.js', 'node_modules/custom-pkg/src/lib.js', 'node_modules/react/index.js', 'node_modules/lodash/index.js', 'index.js'],
});

test('build directory with exceptions', runGitignoreTest, {
	gitignore: 'dist/*\n!dist/types/\n!dist/.gitkeep',
	files: ['dist/.gitkeep', 'dist/types/index.d.ts', 'dist/types/lib.d.ts', 'dist/bundles/main.js', 'dist/bundles/vendor.js', 'src/app.js'],
});

test('coverage directory', runGitignoreTest, {
	gitignore: 'coverage/',
	files: ['coverage/index.html', 'coverage/lcov.info', 'coverage/src/app.js.html', 'src/app.js', 'tests/app.test.js'],
});

test('IDE directories', runGitignoreTest, {
	gitignore: '.idea/\n.vscode/\n*.swp',
	files: ['.idea/workspace.xml', '.vscode/settings.json', 'index.js', 'temp.swp'],
});

test('logs and temp files', runGitignoreTest, {
	gitignore: '*.log\n*.tmp\nlogs/\ntemp/',
	files: ['app.log', 'test.tmp', 'logs/debug.log', 'temp/data.json', 'src/app.js'],
});

// Edge cases
test('only comments', runGitignoreTest, {
	gitignore: '# This is a comment\n# Another comment',
	files: ['app.js', 'test.js'],
});

test('comments and empty lines', runGitignoreTest, {
	gitignore: '# Comment\n*.log\n\n# Another comment\n*.tmp\n\n',
	files: ['app.log', 'test.tmp', 'index.js'],
});

test('very deeply nested files', runGitignoreTest, {
	gitignore: '*.log',
	files: ['a/b/c/d/e/f/g/h/test.log', 'a/b/c/d/e/f/g/h/app.js'],
});

test('dotfiles', runGitignoreTest, {
	gitignore: '.*\n!.gitignore',
	files: ['.env', '.config', '.eslintrc', 'app.js'],
});

test('negation of dotfiles', runGitignoreTest, {
	gitignore: '.*\n!.env.example',
	files: ['.env', '.env.example', '.config', 'app.js'],
});

test('multiple wildcards', runGitignoreTest, {
	gitignore: '*-test-*.js',
	files: ['app-test-unit.js', 'lib-test-integration.js', 'app.js', 'test.js'],
});

test('complex nested structure', runGitignoreTest, {
	gitignore: '*.log\n*.tmp\nnode_modules/*\n!node_modules/keep/\nbuild/\n!build/public/\nbuild/public/*.cache',
	files: ['app.log', 'test.tmp', 'node_modules/keep/index.js', 'node_modules/react/index.js', 'build/public/index.html', 'build/public/app.cache', 'build/private/data.json', 'src/app.js'],
});

test('pattern with multiple slashes', runGitignoreTest, {
	gitignore: 'src/lib/temp',
	files: ['src/lib/temp', 'src/lib/index.js', 'lib/temp', 'temp'],
});

test('pattern with trailing slash and negation', runGitignoreTest, {
	gitignore: 'temp/\n!temp/keep/',
	files: ['temp/delete.js', 'temp/keep/important.js', 'app.js'],
	directories: ['temp', 'temp/keep'],
});

// Performance-critical scenarios
test('large node_modules structure', runGitignoreTest, {
	gitignore: 'node_modules/',
	files: [
		'index.js',
		...Array.from({length: 20}, (_, i) => `node_modules/pkg${i}/index.js`),
		...Array.from({length: 20}, (_, i) => `node_modules/pkg${i}/lib/utils.js`),
	],
});

test('many ignored extensions', runGitignoreTest, {
	gitignore: '*.log\n*.tmp\n*.cache\n*.swp\n*.bak\n*.old',
	files: ['app.log', 'test.tmp', 'data.cache', 'file.swp', 'backup.bak', 'version.old', 'index.js'],
});

// Patterns with special characters
test('pattern with brackets', runGitignoreTest, {
	gitignore: '*[generated]*',
	files: ['app[generated].js', 'test-generated-file.js', 'normal.js'],
});

// Subdirectory patterns
test('subdirectory wildcard pattern', runGitignoreTest, {
	gitignore: 'src/**/*.test.js',
	files: ['src/app.test.js', 'src/lib/utils.test.js', 'tests/app.test.js', 'src/app.js'],
});

test('multiple directory levels', runGitignoreTest, {
	gitignore: 'a/b/c/',
	files: ['a/b/c/d.js', 'a/b/c/e.js', 'a/b/index.js', 'a/index.js'],
	directories: ['a/b/c'],
});

// Mixed scenarios
test('combination of anchored and recursive patterns', runGitignoreTest, {
	gitignore: '/temp\n*.log',
	files: ['temp/file.js', 'src/temp', 'app.log', 'src/debug.log', 'index.js'],
	directories: ['temp'],
});

test('negation with different pattern types', runGitignoreTest, {
	gitignore: '*.js\n!src/**/*.js\n!*.config.js',
	files: ['app.js', 'webpack.config.js', 'src/index.js', 'src/lib/utils.js', 'tests/app.js'],
});

test('overlapping patterns', runGitignoreTest, {
	gitignore: '*.log\ntest.*\n!test.js',
	files: ['app.log', 'test.log', 'test.js', 'test.tmp', 'index.js'],
});
