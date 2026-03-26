import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';
import {temporaryDirectory} from 'tempy';
import {
	getGlobalGitignoreFile,
	getGlobalGitignoreFileAsync,
	buildGlobalPredicate,
} from '../ignore.js';
import {globby, globbySync, globbyStream} from '../index.js';
import {
	createContextAwareFs,
	createTemporaryGitRepository,
	setGitConfigGlobal,
	createGlobalGitignoreConfig,
} from './utilities.js';

const writeFile = (filePath, content = '') => {
	fs.mkdirSync(path.dirname(filePath), {recursive: true});
	fs.writeFileSync(filePath, content, 'utf8');
};

const writeGlobalGitignore = (directory, fileName, content) => {
	const globalIgnorePath = path.join(directory, fileName);
	writeFile(globalIgnorePath, content);
	return globalIgnorePath;
};

const writeGitConfig = (directory, content, fileName = '.gitconfig') => {
	const configFile = path.join(directory, fileName);
	writeFile(configFile, content);
	return configFile;
};

const createGitRepositoryWithRedirectFile = () => {
	const repository = temporaryDirectory();
	const gitDirectory = path.join(repository, '.real-git');
	writeFile(path.join(gitDirectory, 'HEAD'), 'ref: refs/heads/main\n');
	writeFile(path.join(repository, '.git'), `gitdir: ${gitDirectory}\n`);
	return {repository, gitDirectory};
};

const createGlobalGitignoreFs = (filesByPath, {contextAware = false} = {}) => {
	const fsImplementation = contextAware ? createContextAwareFs() : {...fs};
	const readFileSync = fsImplementation.readFileSync.bind(fsImplementation);
	const readFile = fsImplementation.promises?.readFile?.bind(fsImplementation.promises);

	const getFileContent = filePath => filesByPath.get(path.resolve(String(filePath)));

	fsImplementation.readFileSync = function (filePath, ...arguments_) {
		if (this !== fsImplementation) {
			throw new Error('Detached readFileSync context');
		}

		const content = getFileContent(filePath);
		if (content !== undefined) {
			return content;
		}

		return readFileSync(filePath, ...arguments_);
	};

	if (readFile) {
		fsImplementation.promises.readFile = async function (filePath, ...arguments_) {
			if (this !== fsImplementation.promises) {
				throw new Error('Detached promises.readFile context');
			}

			const content = getFileContent(filePath);
			if (content !== undefined) {
				return content;
			}

			return readFile(filePath, ...arguments_);
		};
	}

	return fsImplementation;
};

const setEnvironmentVariables = (t, variables) => {
	const originals = new Map();

	for (const [key, value] of Object.entries(variables)) {
		originals.set(key, process.env[key]);

		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	t.teardown(() => {
		for (const [key, value] of originals) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});
};

const setHomeDirectoryEnvironmentVariables = (t, homeDirectory) => {
	const {root} = path.parse(homeDirectory);
	const homePath = root ? homeDirectory.slice(root.length - 1) : homeDirectory;

	setEnvironmentVariables(t, {
		HOME: homeDirectory,
		USERPROFILE: homeDirectory,
		HOMEDRIVE: root ? root.slice(0, -1) : undefined,
		HOMEPATH: root ? homePath : undefined,
	});
};

const createRepositoryWithGlobalAndLocalIgnore = (t, {globalIgnore, localIgnore, files}) => {
	const {configFile} = createGlobalGitignoreConfig(globalIgnore);
	setGitConfigGlobal(t, configFile);
	const repository = createTemporaryGitRepository();

	for (const [relativePath, content] of files) {
		writeFile(path.join(repository, relativePath), content);
	}

	writeFile(path.join(repository, '.gitignore'), localIgnore);

	return repository;
};

test('buildGlobalPredicate - extension pattern matches at any depth', t => {
	const projectDirectory = temporaryDirectory();
	const globalIgnoreFile = {
		filePath: path.join(os.homedir(), '.gitignore_global'),
		content: '*.log\n',
	};

	const predicate = buildGlobalPredicate(globalIgnoreFile, projectDirectory);

	t.true(predicate(path.join(projectDirectory, 'debug.log')));
	t.true(predicate(path.join(projectDirectory, 'src', 'debug.log')));
	t.true(predicate(path.join(projectDirectory, 'a', 'b', 'c', 'debug.log')));
	t.false(predicate(path.join(projectDirectory, 'src', 'index.js')));
});

test('buildGlobalPredicate - root-anchored pattern only matches at project root', t => {
	const projectDirectory = temporaryDirectory();
	const globalIgnoreFile = {
		filePath: path.join(os.homedir(), '.gitignore_global'),
		content: '/build\n',
	};

	const predicate = buildGlobalPredicate(globalIgnoreFile, projectDirectory);

	t.true(predicate(path.join(projectDirectory, 'build', 'output.js')));
	t.false(predicate(path.join(projectDirectory, 'src', 'build', 'output.js')));
});

test('buildGlobalPredicate - middle-slash pattern matches relative to project root', t => {
	const projectDirectory = temporaryDirectory();
	const globalIgnoreFile = {
		filePath: path.join(os.homedir(), '.gitignore_global'),
		content: 'src/generated\n',
	};

	const predicate = buildGlobalPredicate(globalIgnoreFile, projectDirectory);

	t.true(predicate(path.join(projectDirectory, 'src', 'generated', 'types.ts')));
	t.false(predicate(path.join(projectDirectory, 'lib', 'src', 'generated', 'types.ts')));
});

test('buildGlobalPredicate - files outside cwd are not ignored', t => {
	const projectDirectory = temporaryDirectory();
	const outsideDirectory = temporaryDirectory();
	const globalIgnoreFile = {
		filePath: path.join(os.homedir(), '.gitignore_global'),
		content: '*.log\n',
	};

	const predicate = buildGlobalPredicate(globalIgnoreFile, projectDirectory);

	t.false(predicate(path.join(outsideDirectory, 'debug.log')));
});

test('buildGlobalPredicate - root-anchored patterns stay anchored to git root when cwd is a subdirectory', t => {
	const repository = createTemporaryGitRepository();
	const subdirectory = path.join(repository, 'sub');
	const globalIgnoreFile = {
		filePath: path.join(os.homedir(), '.gitignore_global'),
		content: '/build\n',
	};

	fs.mkdirSync(path.join(repository, 'build'), {recursive: true});
	fs.mkdirSync(path.join(subdirectory, 'build'), {recursive: true});

	const predicate = buildGlobalPredicate(globalIgnoreFile, subdirectory, repository);

	t.true(predicate(path.join(repository, 'build', 'output.js')));
	t.false(predicate(path.join(subdirectory, 'build', 'output.js')));
});

test('buildGlobalPredicate - middle-slash patterns stay anchored to git root when cwd is a subdirectory', t => {
	const repository = createTemporaryGitRepository();
	const subdirectory = path.join(repository, 'sub');
	const globalIgnoreFile = {
		filePath: path.join(os.homedir(), '.gitignore_global'),
		content: 'src/generated\n',
	};

	fs.mkdirSync(path.join(repository, 'src', 'generated'), {recursive: true});
	fs.mkdirSync(path.join(subdirectory, 'src', 'generated'), {recursive: true});

	const predicate = buildGlobalPredicate(globalIgnoreFile, subdirectory, repository);

	t.true(predicate(path.join(repository, 'src', 'generated', 'types.ts')));
	t.false(predicate(path.join(subdirectory, 'src', 'generated', 'types.ts')));
});

test.serial('getGlobalGitignoreFile - GIT_CONFIG_GLOBAL empty string still uses default ignore file', t => {
	const homeDirectory = temporaryDirectory();
	const defaultGlobalIgnorePath = writeGlobalGitignore(homeDirectory, path.join('.config', 'git', 'ignore'), '*.log\n');
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		GIT_CONFIG_GLOBAL: '',
		XDG_CONFIG_HOME: path.join(homeDirectory, '.config'),
	});

	t.deepEqual(getGlobalGitignoreFile(), {filePath: defaultGlobalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - returns undefined when no core.excludesfile configured', t => {
	const homeDirectory = temporaryDirectory();
	const directory = temporaryDirectory();
	const configFile = writeGitConfig(directory, '[user]\n\tname = Test\n');
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		XDG_CONFIG_HOME: path.join(homeDirectory, '.config'),
	});
	setGitConfigGlobal(t, configFile);

	t.is(getGlobalGitignoreFile(), undefined);
});

test.serial('getGlobalGitignoreFile - falls back to the default global ignore file when core.excludesfile is unset', t => {
	const homeDirectory = temporaryDirectory();
	const defaultGlobalIgnorePath = writeGlobalGitignore(homeDirectory, path.join('.config', 'git', 'ignore'), '*.log\n');
	const configFile = writeGitConfig(homeDirectory, '[user]\n\tname = Test\n');
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		GIT_CONFIG_GLOBAL: configFile,
		XDG_CONFIG_HOME: undefined,
	});

	t.deepEqual(getGlobalGitignoreFile(), {filePath: defaultGlobalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - returns undefined when configured file does not exist', t => {
	const directory = temporaryDirectory();
	const nonExistentPath = path.join(directory, 'nonexistent.gitignore');
	const configFile = writeGitConfig(directory, `[core]\n\texcludesfile = ${nonExistentPath}\n`);
	setGitConfigGlobal(t, configFile);

	t.is(getGlobalGitignoreFile(), undefined);
});

test.serial('getGlobalGitignoreFile - throws when configured path is not a readable file', t => {
	const directory = temporaryDirectory();
	const invalidPath = path.join(directory, 'not-a-file');
	const configFile = writeGitConfig(directory, `[core]\n\texcludesfile = ${invalidPath}\n`);
	setGitConfigGlobal(t, configFile);
	fs.mkdirSync(invalidPath, {recursive: true});

	const error = t.throws(() => {
		getGlobalGitignoreFile();
	});

	t.regex(error.message, /Failed to read ignore file at .*not-a-file/);
});

test.serial('getGlobalGitignoreFile - throws when git config file is not readable', t => {
	const directory = temporaryDirectory();
	const configPath = path.join(directory, '.gitconfig');
	fs.mkdirSync(configPath, {recursive: true});
	setGitConfigGlobal(t, configPath);

	const error = t.throws(() => {
		getGlobalGitignoreFile();
	});

	t.regex(error.message, /Failed to read git config at .*\.gitconfig/);
});

test.serial('getGlobalGitignoreFile - suppressErrors skips unreadable git config file', t => {
	const directory = temporaryDirectory();
	const configPath = path.join(directory, '.gitconfig');
	const homeDirectory = temporaryDirectory();
	fs.mkdirSync(configPath, {recursive: true});
	setGitConfigGlobal(t, configPath);
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		XDG_CONFIG_HOME: path.join(homeDirectory, '.config'),
	});

	t.is(getGlobalGitignoreFile({suppressErrors: true}), undefined);
});

test.serial('getGlobalGitignoreFile - strips inline comments from excludesfile path', t => {
	const content = '*.log\n';
	const {globalIgnorePath} = createGlobalGitignoreConfig(content);
	const directory = temporaryDirectory();
	const configFile = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath} # my global ignore\n`);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content});
});

test.serial('getGlobalGitignoreFile - strips semicolon inline comments from excludesfile path', t => {
	const content = '*.log\n';
	const {globalIgnorePath} = createGlobalGitignoreConfig(content);
	const directory = temporaryDirectory();
	const configFile = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath} ; my global ignore\n`);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content});
});

test.serial('getGlobalGitignoreFile - parses section headers with trailing comments', t => {
	const content = '*.log\n';
	const {globalIgnorePath} = createGlobalGitignoreConfig(content);
	const directory = temporaryDirectory();
	const configFile = writeGitConfig(directory, `[core] ; trailing comment\n\texcludesfile = ${globalIgnorePath}\n`);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content});
});

test.serial('getGlobalGitignoreFile - reads quoted excludesfile path', t => {
	const directory = temporaryDirectory();
	const content = '*.log\n';
	const globalIgnorePath = writeGlobalGitignore(directory, path.join('Application Support', 'git;ignore#global'), content);
	const configFile = writeGitConfig(directory, `[core]\n\texcludesfile = "${globalIgnorePath}"\n`);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content});
});

test.serial('getGlobalGitignoreFile - reads quoted excludesfile path with trailing comment', t => {
	const directory = temporaryDirectory();
	const content = '*.log\n';
	const globalIgnorePath = writeGlobalGitignore(directory, path.join('Application Support', 'git ignore'), content);
	const configFile = writeGitConfig(directory, `[core]\n\texcludesfile = "${globalIgnorePath}" ; trailing comment\n`);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content});
});

test.serial('getGlobalGitignoreFile - expands quoted tilde paths', t => {
	const homeDirectory = temporaryDirectory();
	const content = '*.log\n';
	const globalIgnorePath = writeGlobalGitignore(homeDirectory, '.gitignore_global', content);
	const configFile = writeGitConfig(homeDirectory, '[core]\n\texcludesfile = "~/.gitignore_global"\n');
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		GIT_CONFIG_GLOBAL: configFile,
	});

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content});
});

test.serial('getGlobalGitignoreFile - reads file content when configured correctly', t => {
	const content = '*.log\n*.tmp\n';
	const {globalIgnorePath, configFile} = createGlobalGitignoreConfig(content);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content});
});

test.serial('getGlobalGitignoreFile - resolves relative excludesfile against the declaring config file', t => {
	const cwd = temporaryDirectory();
	const configDirectory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(configDirectory, 'relative.gitignore_global', '*.log\n');
	const configFile = writeGitConfig(configDirectory, '[core]\n\texcludesfile = relative.gitignore_global\n');
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile({cwd}), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - resolves relative excludesfile against the declaring config file when cwd is a repository subdirectory', t => {
	const repository = createTemporaryGitRepository();
	const subdirectory = path.join(repository, 'sub');
	const configDirectory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(configDirectory, 'relative.gitignore_global', '*.log\n');
	const configFile = writeGitConfig(configDirectory, '[core]\n\texcludesfile = relative.gitignore_global\n');
	setGitConfigGlobal(t, configFile);
	fs.mkdirSync(subdirectory, {recursive: true});

	t.deepEqual(getGlobalGitignoreFile({cwd: subdirectory}), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - does not resolve relative excludesfile from the repository root', t => {
	const repository = createTemporaryGitRepository();
	const configDirectory = temporaryDirectory();
	const configFile = writeGitConfig(configDirectory, '[core]\n\texcludesfile = relative.gitignore_global\n');
	setGitConfigGlobal(t, configFile);
	writeGlobalGitignore(repository, 'relative.gitignore_global', '*.log\n');

	t.is(getGlobalGitignoreFile({cwd: repository}), undefined);
});

test.serial('getGlobalGitignoreFile - uses provided fs adapter', t => {
	const cwd = temporaryDirectory();
	const configPath = path.join(cwd, 'virtual.gitconfig');
	const globalIgnorePath = path.join(cwd, 'virtual.gitignore_global');
	const fsImplementation = createGlobalGitignoreFs(new Map([
		[path.resolve(configPath), `[core]\n\texcludesfile = ${globalIgnorePath}\n`],
		[path.resolve(globalIgnorePath), '*.log\n'],
	]), {contextAware: true});
	setGitConfigGlobal(t, configPath);

	t.deepEqual(getGlobalGitignoreFile({cwd, fs: fsImplementation}), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - uses provided fs adapter for includeIf config when .git is a redirect file', t => {
	const {repository, gitDirectory} = createGitRepositoryWithRedirectFile();
	const directory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(directory, 'include-if-worktree.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'include-if-worktree.gitconfig');
	const configFile = writeGitConfig(directory, `[includeIf "gitdir:${gitDirectory}"]\n\tpath = ${includedConfigPath}\n`);
	const fsImplementation = createContextAwareFs();
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile({cwd: repository, fs: fsImplementation}), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - empty excludesfile overrides older config', t => {
	const homeDirectory = temporaryDirectory();
	const xdgConfigHome = path.join(homeDirectory, '.config');
	const globalIgnorePath = writeGlobalGitignore(homeDirectory, '.gitignore_global', '*.log\n');
	writeGitConfig(xdgConfigHome, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, path.join('git', 'config'));
	writeGitConfig(homeDirectory, '[core]\n\texcludesfile =\n');
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		GIT_CONFIG_GLOBAL: undefined,
		XDG_CONFIG_HOME: xdgConfigHome,
	});

	t.is(getGlobalGitignoreFile(), undefined);
});

test.serial('getGlobalGitignoreFile - later core section overrides earlier core section', t => {
	const directory = temporaryDirectory();
	const firstGlobalIgnorePath = writeGlobalGitignore(directory, 'first.gitignore_global', '*.log\n');
	const secondGlobalIgnorePath = writeGlobalGitignore(directory, 'second.gitignore_global', '*.tmp\n');
	const configFile = writeGitConfig(directory, `[core]\n\texcludesfile = ${firstGlobalIgnorePath}\n[core]\n\texcludesfile = ${secondGlobalIgnorePath}\n`);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: secondGlobalIgnorePath, content: '*.tmp\n'});
});

test.serial('getGlobalGitignoreFile - reads excludesfile from included config', t => {
	const directory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(directory, 'included.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'included.gitconfig');
	const configFile = writeGitConfig(directory, `[include]\n\tpath = ${includedConfigPath}\n`);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - resolves relative excludesfile from the included config file that declared it', t => {
	const directory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(directory, path.join('includes', 'included.gitignore_global'), '*.log\n');
	writeGitConfig(directory, '[core]\n\texcludesfile = included.gitignore_global\n', path.join('includes', 'included.gitconfig'));
	const configFile = writeGitConfig(directory, '[include]\n\tpath = includes/included.gitconfig\n');
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - resolves relative include paths from the including config file', t => {
	const directory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(directory, 'relative-include.gitignore_global', '*.log\n');
	writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, path.join('includes', 'included.gitconfig'));
	const configFile = writeGitConfig(directory, '[include]\n\tpath = includes/included.gitconfig\n');
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - reads excludesfile from nested included configs', t => {
	const directory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(directory, 'nested.gitignore_global', '*.log\n');
	writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, path.join('includes', 'deep.gitconfig'));
	writeGitConfig(directory, '[include]\n\tpath = deep.gitconfig\n', path.join('includes', 'middle.gitconfig'));
	const configFile = writeGitConfig(directory, '[include]\n\tpath = includes/middle.gitconfig\n');
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - reads excludesfile from includeIf config', t => {
	const repository = createTemporaryGitRepository();
	const directory = temporaryDirectory();
	const gitDirectory = path.join(repository, '.git');
	const globalIgnorePath = writeGlobalGitignore(directory, 'include-if.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'include-if.gitconfig');
	const configFile = writeGitConfig(directory, `[includeIf "gitdir:${gitDirectory}"]\n\tpath = ${includedConfigPath}\n`);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile({cwd: repository}), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - reads excludesfile from case-insensitive includeIf config', t => {
	const repository = createTemporaryGitRepository();
	const directory = temporaryDirectory();
	const gitDirectory = path.join(repository, '.git').toUpperCase();
	const globalIgnorePath = writeGlobalGitignore(directory, 'include-if-i.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'include-if-i.gitconfig');
	const configFile = writeGitConfig(directory, `[includeIf "gitdir/i:${gitDirectory}"]\n\tpath = ${includedConfigPath}\n`);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile({cwd: repository}), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - reads excludesfile from includeIf gitdir config containing ] in pattern', t => {
	const repository = createTemporaryGitRepository();
	const directory = temporaryDirectory();
	const parentDirectory = path.dirname(repository);
	const repositoryName = path.basename(repository);
	const bracketPattern = repositoryName.length >= 2
		? `${repositoryName[0]}[${repositoryName[1]}]${repositoryName.slice(2)}`
		: `[${repositoryName}]`;
	const gitDirectoryPattern = path.join(parentDirectory, bracketPattern, '.git');
	const globalIgnorePath = writeGlobalGitignore(directory, 'include-if-bracket.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'include-if-bracket.gitconfig');
	const configFile = writeGitConfig(directory, `[includeIf "gitdir:${gitDirectoryPattern}"]\n\tpath = ${includedConfigPath}\n`);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile({cwd: repository}), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - ignores unsupported non-gitdir includeIf conditions', t => {
	const repository = createTemporaryGitRepository();
	const homeDirectory = temporaryDirectory();
	const directory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(directory, 'include-if-onbranch.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'include-if-onbranch.gitconfig');
	const configFile = writeGitConfig(directory, `[includeIf "onbranch:main"]\n\tpath = ${includedConfigPath}\n`);
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		XDG_CONFIG_HOME: path.join(homeDirectory, '.config'),
	});
	setGitConfigGlobal(t, configFile);

	t.is(getGlobalGitignoreFile({cwd: repository}), undefined);
});

test.serial('getGlobalGitignoreFile - reads excludesfile from includeIf config when .git is a redirect file', t => {
	const {repository, gitDirectory} = createGitRepositoryWithRedirectFile();
	const directory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(directory, 'include-if-worktree.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'include-if-worktree.gitconfig');
	const configFile = writeGitConfig(directory, `[includeIf "gitdir:${gitDirectory}"]\n\tpath = ${includedConfigPath}\n`);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile({cwd: repository}), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - applies repeated includes in order', t => {
	const directory = temporaryDirectory();
	const firstGlobalIgnorePath = writeGlobalGitignore(directory, 'first.gitignore_global', '*.log\n');
	const secondGlobalIgnorePath = writeGlobalGitignore(directory, 'second.gitignore_global', '*.tmp\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${firstGlobalIgnorePath}\n`, 'repeated.gitconfig');
	const configFile = writeGitConfig(directory, `[include]\n\tpath = ${includedConfigPath}\n[core]\n\texcludesfile = ${secondGlobalIgnorePath}\n[include]\n\tpath = ${includedConfigPath}\n`);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: firstGlobalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - ~/.gitconfig overrides XDG config', t => {
	const homeDirectory = temporaryDirectory();
	const xdgConfigHome = path.join(homeDirectory, '.config');
	const xdgGlobalIgnorePath = writeGlobalGitignore(homeDirectory, 'xdg.gitignore_global', '*.log\n');
	const homeGlobalIgnorePath = writeGlobalGitignore(homeDirectory, '.gitignore_global', '*.tmp\n');
	writeGitConfig(xdgConfigHome, `[core]\n\texcludesfile = ${xdgGlobalIgnorePath}\n`, path.join('git', 'config'));
	writeGitConfig(homeDirectory, `[core]\n\texcludesfile = ${homeGlobalIgnorePath}\n`);
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		GIT_CONFIG_GLOBAL: undefined,
		XDG_CONFIG_HOME: xdgConfigHome,
	});

	t.deepEqual(getGlobalGitignoreFile(), {filePath: homeGlobalIgnorePath, content: '*.tmp\n'});
});

test.serial('getGlobalGitignoreFile - uses XDG config when ~/.gitconfig is absent', t => {
	const homeDirectory = temporaryDirectory();
	const xdgConfigHome = path.join(homeDirectory, '.config');
	const globalIgnorePath = writeGlobalGitignore(homeDirectory, 'xdg.gitignore_global', '*.log\n');
	writeGitConfig(xdgConfigHome, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, path.join('git', 'config'));
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		GIT_CONFIG_GLOBAL: undefined,
		XDG_CONFIG_HOME: xdgConfigHome,
	});

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('getGlobalGitignoreFile - treats empty XDG_CONFIG_HOME as ~/.config', t => {
	const homeDirectory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(homeDirectory, 'xdg.gitignore_global', '*.log\n');
	writeGitConfig(homeDirectory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, path.join('.config', 'git', 'config'));
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		GIT_CONFIG_GLOBAL: undefined,
		XDG_CONFIG_HOME: '',
	});

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content: '*.log\n'});
});

test.serial('globalGitignore option - filters files matching global patterns', async t => {
	const {configFile} = createGlobalGitignoreConfig('*.log\n');
	setGitConfigGlobal(t, configFile);
	const projectDirectory = temporaryDirectory();

	fs.mkdirSync(path.join(projectDirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: projectDirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - falls back to the default global ignore file when core.excludesfile is unset', async t => {
	const homeDirectory = temporaryDirectory();
	const configFile = writeGitConfig(homeDirectory, '[user]\n\tname = Test\n');
	const projectDirectory = temporaryDirectory();
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		GIT_CONFIG_GLOBAL: configFile,
		XDG_CONFIG_HOME: undefined,
	});
	writeGlobalGitignore(homeDirectory, path.join('.config', 'git', 'ignore'), '*.log\n');

	fs.mkdirSync(path.join(projectDirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: projectDirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - throws when configured path is not a readable file', async t => {
	const directory = temporaryDirectory();
	const invalidPath = path.join(directory, 'not-a-file');
	const configFile = writeGitConfig(directory, `[core]\n\texcludesfile = ${invalidPath}\n`);
	const projectDirectory = temporaryDirectory();
	setGitConfigGlobal(t, configFile);
	fs.mkdirSync(invalidPath, {recursive: true});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');

	const error = await t.throwsAsync(async () => {
		await globby('**/*', {cwd: projectDirectory, globalGitignore: true});
	});

	t.regex(error.message, /Failed to read ignore file at .*not-a-file/);
});

test.serial('globalGitignore option - throws when git config file is not readable', async t => {
	const directory = temporaryDirectory();
	const configPath = path.join(directory, '.gitconfig');
	const projectDirectory = temporaryDirectory();
	fs.mkdirSync(configPath, {recursive: true});
	setGitConfigGlobal(t, configPath);
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');

	const error = await t.throwsAsync(async () => {
		await globby('**/*', {cwd: projectDirectory, globalGitignore: true});
	});

	t.regex(error.message, /Failed to read git config at .*\.gitconfig/);
});

test.serial('globalGitignore option - suppressErrors skips unreadable git config file', async t => {
	const directory = temporaryDirectory();
	const configPath = path.join(directory, '.gitconfig');
	const projectDirectory = temporaryDirectory();
	const homeDirectory = temporaryDirectory();
	fs.mkdirSync(configPath, {recursive: true});
	setGitConfigGlobal(t, configPath);
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		XDG_CONFIG_HOME: path.join(homeDirectory, '.config'),
	});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');

	const result = await globby('**/*', {cwd: projectDirectory, globalGitignore: true, suppressErrors: true});
	t.deepEqual(result, ['index.js']);
});

test.serial('globalGitignore option - works with quoted excludesfile config', async t => {
	const directory = temporaryDirectory();
	const globalIgnoreDirectory = path.join(directory, 'Application Support');
	const globalIgnorePath = path.join(globalIgnoreDirectory, 'git ignore');
	const configFile = path.join(directory, '.gitconfig');
	const projectDirectory = temporaryDirectory();

	fs.mkdirSync(globalIgnoreDirectory, {recursive: true});
	fs.writeFileSync(globalIgnorePath, '*.log\n', 'utf8');
	fs.writeFileSync(configFile, `[core]\n\texcludesfile = "${globalIgnorePath}"\n`, 'utf8');
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(projectDirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: projectDirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - resolves relative excludesfile against the declaring config file', async t => {
	const projectDirectory = temporaryDirectory();
	const configDirectory = temporaryDirectory();
	const relativeGlobalIgnorePath = 'relative.gitignore_global';
	const configFile = writeGitConfig(configDirectory, `[core]\n\texcludesfile = ${relativeGlobalIgnorePath}\n`);
	setGitConfigGlobal(t, configFile);
	writeGlobalGitignore(configDirectory, relativeGlobalIgnorePath, '*.log\n');

	fs.mkdirSync(path.join(projectDirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: projectDirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - resolves relative excludesfile against the declaring config file when cwd is a repository subdirectory', async t => {
	const repository = createTemporaryGitRepository();
	const subdirectory = path.join(repository, 'sub');
	const configDirectory = temporaryDirectory();
	const configFile = writeGitConfig(configDirectory, '[core]\n\texcludesfile = relative.gitignore_global\n');
	setGitConfigGlobal(t, configFile);
	writeGlobalGitignore(configDirectory, 'relative.gitignore_global', '*.log\n');

	fs.mkdirSync(path.join(subdirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(subdirectory, 'index.js'), '');
	fs.writeFileSync(path.join(subdirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(subdirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(subdirectory, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: subdirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - does not resolve relative excludesfile from the repository root', async t => {
	const repository = createTemporaryGitRepository();
	const configDirectory = temporaryDirectory();
	const configFile = writeGitConfig(configDirectory, '[core]\n\texcludesfile = relative.gitignore_global\n');
	setGitConfigGlobal(t, configFile);
	writeGlobalGitignore(repository, 'relative.gitignore_global', '*.log\n');

	fs.mkdirSync(path.join(repository, 'src'), {recursive: true});
	fs.writeFileSync(path.join(repository, 'index.js'), '');
	fs.writeFileSync(path.join(repository, 'debug.log'), '');
	fs.writeFileSync(path.join(repository, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(repository, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: repository, globalGitignore: true});
	t.deepEqual(result.sort(), ['debug.log', 'index.js', 'relative.gitignore_global', 'src/app.js', 'src/error.log']);
});

test.serial('globalGitignore option - uses provided fs adapter', async t => {
	const projectDirectory = temporaryDirectory();
	const configPath = path.join(projectDirectory, 'virtual.gitconfig');
	const globalIgnorePath = path.join(projectDirectory, 'virtual.gitignore_global');
	const fsImplementation = createGlobalGitignoreFs(new Map([
		[path.resolve(configPath), `[core]\n\texcludesfile = ${globalIgnorePath}\n`],
		[path.resolve(globalIgnorePath), '*.log\n'],
	]), {contextAware: true});
	setGitConfigGlobal(t, configPath);

	fs.mkdirSync(path.join(projectDirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: projectDirectory, fs: fsImplementation, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - root-anchored patterns stay anchored to git root when cwd is a subdirectory', async t => {
	const repository = createTemporaryGitRepository();
	const subdirectory = path.join(repository, 'sub');
	const {configFile} = createGlobalGitignoreConfig('/build\n');
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(subdirectory, 'build'), {recursive: true});
	fs.writeFileSync(path.join(subdirectory, 'build', 'output.js'), '');
	fs.writeFileSync(path.join(subdirectory, 'index.js'), '');

	const result = await globby('**/*', {cwd: subdirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['build/output.js', 'index.js']);
});

test.serial('globalGitignore option - middle-slash patterns stay anchored to git root when cwd is a subdirectory', async t => {
	const repository = createTemporaryGitRepository();
	const subdirectory = path.join(repository, 'sub');
	const {configFile} = createGlobalGitignoreConfig('src/generated\n');
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(subdirectory, 'src', 'generated'), {recursive: true});
	fs.writeFileSync(path.join(subdirectory, 'src', 'generated', 'types.ts'), '');
	fs.writeFileSync(path.join(subdirectory, 'index.js'), '');

	const result = await globby('**/*', {cwd: subdirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/generated/types.ts']);
});

test.serial('globalGitignore option - reads excludesfile from included config', async t => {
	const directory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(directory, 'included.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'included.gitconfig');
	const configFile = writeGitConfig(directory, `[include]\n\tpath = ${includedConfigPath}\n`);
	const projectDirectory = temporaryDirectory();
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(projectDirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: projectDirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - resolves relative excludesfile from the included config file that declared it', async t => {
	const directory = temporaryDirectory();
	writeGlobalGitignore(directory, path.join('includes', 'included.gitignore_global'), '*.log\n');
	writeGitConfig(directory, '[core]\n\texcludesfile = included.gitignore_global\n', path.join('includes', 'included.gitconfig'));
	const configFile = writeGitConfig(directory, '[include]\n\tpath = includes/included.gitconfig\n');
	const projectDirectory = temporaryDirectory();
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(projectDirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: projectDirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - reads excludesfile from relative included config', async t => {
	const directory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(directory, 'relative-included.gitignore_global', '*.log\n');
	writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, path.join('includes', 'included.gitconfig'));
	const configFile = writeGitConfig(directory, '[include]\n\tpath = includes/included.gitconfig\n');
	const projectDirectory = temporaryDirectory();
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(projectDirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: projectDirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - reads excludesfile from nested included configs', async t => {
	const directory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(directory, 'nested-included.gitignore_global', '*.log\n');
	writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, path.join('includes', 'deep.gitconfig'));
	writeGitConfig(directory, '[include]\n\tpath = deep.gitconfig\n', path.join('includes', 'middle.gitconfig'));
	const configFile = writeGitConfig(directory, '[include]\n\tpath = includes/middle.gitconfig\n');
	const projectDirectory = temporaryDirectory();
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(projectDirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: projectDirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - reads excludesfile from includeIf config', async t => {
	const repository = createTemporaryGitRepository();
	const directory = temporaryDirectory();
	const gitDirectory = path.join(repository, '.git');
	const globalIgnorePath = writeGlobalGitignore(directory, 'include-if.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'include-if.gitconfig');
	const configFile = writeGitConfig(directory, `[includeIf "gitdir:${gitDirectory}"]\n\tpath = ${includedConfigPath}\n`);
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(repository, 'src'), {recursive: true});
	fs.writeFileSync(path.join(repository, 'index.js'), '');
	fs.writeFileSync(path.join(repository, 'debug.log'), '');
	fs.writeFileSync(path.join(repository, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(repository, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: repository, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - reads excludesfile from case-insensitive includeIf config', async t => {
	const repository = createTemporaryGitRepository();
	const directory = temporaryDirectory();
	const gitDirectory = path.join(repository, '.git').toUpperCase();
	const globalIgnorePath = writeGlobalGitignore(directory, 'include-if-i.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'include-if-i.gitconfig');
	const configFile = writeGitConfig(directory, `[includeIf "gitdir/i:${gitDirectory}"]\n\tpath = ${includedConfigPath}\n`);
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(repository, 'src'), {recursive: true});
	fs.writeFileSync(path.join(repository, 'index.js'), '');
	fs.writeFileSync(path.join(repository, 'debug.log'), '');
	fs.writeFileSync(path.join(repository, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(repository, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: repository, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - reads excludesfile from includeIf gitdir config containing ] in pattern', async t => {
	const repository = createTemporaryGitRepository();
	const directory = temporaryDirectory();
	const parentDirectory = path.dirname(repository);
	const repositoryName = path.basename(repository);
	const bracketPattern = repositoryName.length >= 2
		? `${repositoryName[0]}[${repositoryName[1]}]${repositoryName.slice(2)}`
		: `[${repositoryName}]`;
	const gitDirectoryPattern = path.join(parentDirectory, bracketPattern, '.git');
	const globalIgnorePath = writeGlobalGitignore(directory, 'include-if-bracket.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'include-if-bracket.gitconfig');
	const configFile = writeGitConfig(directory, `[includeIf "gitdir:${gitDirectoryPattern}"]\n\tpath = ${includedConfigPath}\n`);
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(repository, 'src'), {recursive: true});
	fs.writeFileSync(path.join(repository, 'index.js'), '');
	fs.writeFileSync(path.join(repository, 'debug.log'), '');
	fs.writeFileSync(path.join(repository, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(repository, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: repository, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - reads excludesfile from includeIf config when .git is a redirect file', async t => {
	const {repository, gitDirectory} = createGitRepositoryWithRedirectFile();
	const directory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(directory, 'include-if-worktree.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'include-if-worktree.gitconfig');
	const configFile = writeGitConfig(directory, `[includeIf "gitdir:${gitDirectory}"]\n\tpath = ${includedConfigPath}\n`);
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(repository, 'src'), {recursive: true});
	fs.writeFileSync(path.join(repository, 'index.js'), '');
	fs.writeFileSync(path.join(repository, 'debug.log'), '');
	fs.writeFileSync(path.join(repository, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(repository, 'src', 'error.log'), '');

	const result = await globby('**/*', {cwd: repository, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - disabled by default', async t => {
	const {configFile} = createGlobalGitignoreConfig('*.log\n');
	setGitConfigGlobal(t, configFile);
	const projectDirectory = temporaryDirectory();

	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');

	const result = await globby('**/*', {cwd: projectDirectory});
	t.deepEqual(result.sort(), ['debug.log', 'index.js']);
});

test.serial('globalGitignore option - works with globbySync', t => {
	const {configFile} = createGlobalGitignoreConfig('*.log\n');
	setGitConfigGlobal(t, configFile);
	const projectDirectory = temporaryDirectory();

	fs.mkdirSync(path.join(projectDirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'error.log'), '');

	t.deepEqual(globbySync('**/*', {cwd: projectDirectory, globalGitignore: true}).sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - globbySync keeps root-anchored patterns anchored to git root when cwd is a subdirectory', t => {
	const repository = createTemporaryGitRepository();
	const subdirectory = path.join(repository, 'sub');
	const {configFile} = createGlobalGitignoreConfig('/build\n');
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(subdirectory, 'build'), {recursive: true});
	fs.writeFileSync(path.join(subdirectory, 'build', 'output.js'), '');
	fs.writeFileSync(path.join(subdirectory, 'index.js'), '');

	t.deepEqual(globbySync('**/*', {cwd: subdirectory, globalGitignore: true}).sort(), ['build/output.js', 'index.js']);
});

test.serial('globalGitignore option - globbySync resolves relative excludesfile against the declaring config file when cwd is a repository subdirectory', t => {
	const repository = createTemporaryGitRepository();
	const subdirectory = path.join(repository, 'sub');
	const configDirectory = temporaryDirectory();
	const configFile = writeGitConfig(configDirectory, '[core]\n\texcludesfile = relative.gitignore_global\n');
	setGitConfigGlobal(t, configFile);
	writeGlobalGitignore(configDirectory, 'relative.gitignore_global', '*.log\n');

	fs.mkdirSync(path.join(subdirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(subdirectory, 'index.js'), '');
	fs.writeFileSync(path.join(subdirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(subdirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(subdirectory, 'src', 'error.log'), '');

	t.deepEqual(globbySync('**/*', {cwd: subdirectory, globalGitignore: true}).sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - globbySync requires statSync when a custom fs is provided', t => {
	const repository = createTemporaryGitRepository();
	const subdirectory = path.join(repository, 'sub');
	const {configFile} = createGlobalGitignoreConfig('/build\n');
	const fsImplementation = createContextAwareFs();
	setGitConfigGlobal(t, configFile);
	fsImplementation.statSync = undefined;

	fs.mkdirSync(path.join(repository, 'build'), {recursive: true});
	fs.mkdirSync(path.join(subdirectory, 'build'), {recursive: true});
	fs.writeFileSync(path.join(repository, 'build', 'output.js'), '');
	fs.writeFileSync(path.join(subdirectory, 'build', 'output.js'), '');
	fs.writeFileSync(path.join(subdirectory, 'index.js'), '');

	const error = t.throws(() => {
		globbySync('**/*', {cwd: subdirectory, fs: fsImplementation, globalGitignore: true});
	});

	t.is(error.message, 'The `globalGitignore` option in `globbySync()` requires `fs.statSync` when a custom `fs` is provided.');
});

test.serial('globalGitignore option - globbySync reads excludesfile from includeIf config when .git is a redirect file and fs adapter is provided', t => {
	const {repository, gitDirectory} = createGitRepositoryWithRedirectFile();
	const directory = temporaryDirectory();
	const globalIgnorePath = writeGlobalGitignore(directory, 'include-if-worktree.gitignore_global', '*.log\n');
	const includedConfigPath = writeGitConfig(directory, `[core]\n\texcludesfile = ${globalIgnorePath}\n`, 'include-if-worktree.gitconfig');
	const configFile = writeGitConfig(directory, `[includeIf "gitdir:${gitDirectory}"]\n\tpath = ${includedConfigPath}\n`);
	const fsImplementation = createContextAwareFs();
	setGitConfigGlobal(t, configFile);

	fs.mkdirSync(path.join(repository, 'src'), {recursive: true});
	fs.writeFileSync(path.join(repository, 'index.js'), '');
	fs.writeFileSync(path.join(repository, 'debug.log'), '');
	fs.writeFileSync(path.join(repository, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(repository, 'src', 'error.log'), '');

	t.deepEqual(globbySync('**/*', {cwd: repository, fs: fsImplementation, globalGitignore: true}).sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - works with globbyStream', async t => {
	const {configFile} = createGlobalGitignoreConfig('*.log\n');
	setGitConfigGlobal(t, configFile);
	const projectDirectory = temporaryDirectory();

	fs.mkdirSync(path.join(projectDirectory, 'src'), {recursive: true});
	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'src', 'error.log'), '');

	const result = [];
	for await (const file of globbyStream('**/*', {cwd: projectDirectory, globalGitignore: true})) {
		result.push(file);
	}

	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - combined with gitignore option filters from both', async t => {
	const {configFile} = createGlobalGitignoreConfig('*.log\n');
	setGitConfigGlobal(t, configFile);
	const repository = createTemporaryGitRepository();

	fs.mkdirSync(path.join(repository, 'src'), {recursive: true});
	fs.writeFileSync(path.join(repository, 'index.js'), '');
	fs.writeFileSync(path.join(repository, 'debug.log'), '');
	fs.writeFileSync(path.join(repository, 'build.tmp'), '');
	fs.writeFileSync(path.join(repository, 'src', 'app.js'), '');
	fs.writeFileSync(path.join(repository, 'src', 'error.log'), '');
	fs.writeFileSync(path.join(repository, '.gitignore'), '*.tmp\n', 'utf8');

	const result = await globby('**/*', {cwd: repository, gitignore: true, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'src/app.js']);
});

test.serial('globalGitignore option - repo .gitignore negation overrides global ignore', async t => {
	const repository = createRepositoryWithGlobalAndLocalIgnore(t, {
		globalIgnore: '*.log\n',
		localIgnore: '!debug.log\n',
		files: [
			['index.js', ''],
			['debug.log', ''],
			['error.log', ''],
		],
	});

	const result = await globby('**/*', {cwd: repository, gitignore: true, globalGitignore: true});
	t.deepEqual(result.sort(), ['debug.log', 'index.js']);
});

test.serial('globalGitignore option - repo .gitignore negation does not override globally ignored parent directory', async t => {
	const repository = createRepositoryWithGlobalAndLocalIgnore(t, {
		globalIgnore: 'logs/\n',
		localIgnore: '!logs/important.log\n',
		files: [
			['index.js', ''],
			['logs/important.log', ''],
		],
	});

	const result = await globby('**/*', {cwd: repository, gitignore: true, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js']);
});

test.serial('globalGitignore option - repo .gitignore can re-include globally ignored directory before file negation', async t => {
	const repository = createRepositoryWithGlobalAndLocalIgnore(t, {
		globalIgnore: 'logs/\n',
		localIgnore: '!logs/\n!logs/important.log\n',
		files: [
			['index.js', ''],
			['logs/important.log', ''],
		],
	});

	const result = await globby('**/*', {cwd: repository, gitignore: true, globalGitignore: true});
	t.deepEqual(result.sort(), ['index.js', 'logs/important.log']);
});

test.serial('globalGitignore option - globbySync repo .gitignore negation does not override globally ignored parent directory', t => {
	const repository = createRepositoryWithGlobalAndLocalIgnore(t, {
		globalIgnore: 'logs/\n',
		localIgnore: '!logs/important.log\n',
		files: [
			['index.js', ''],
			['logs/important.log', ''],
		],
	});

	t.deepEqual(globbySync('**/*', {cwd: repository, gitignore: true, globalGitignore: true}).sort(), ['index.js']);
});

test.serial('globalGitignore option - globbySync repo .gitignore can re-include globally ignored directory before file negation', t => {
	const repository = createRepositoryWithGlobalAndLocalIgnore(t, {
		globalIgnore: 'logs/\n',
		localIgnore: '!logs/\n!logs/important.log\n',
		files: [
			['index.js', ''],
			['logs/important.log', ''],
		],
	});

	t.deepEqual(globbySync('**/*', {cwd: repository, gitignore: true, globalGitignore: true}).sort(), ['index.js', 'logs/important.log']);
});

test.serial('globalGitignore option - globbySync repo .gitignore negation still overrides direct global file ignore', t => {
	const repository = createRepositoryWithGlobalAndLocalIgnore(t, {
		globalIgnore: '*.log\n',
		localIgnore: '!debug.log\n',
		files: [
			['index.js', ''],
			['debug.log', ''],
			['error.log', ''],
		],
	});

	t.deepEqual(globbySync('**/*', {cwd: repository, gitignore: true, globalGitignore: true}).sort(), ['debug.log', 'index.js']);
});

test.serial('globalGitignore option - onlyFiles false does not return globally ignored directories', async t => {
	const {configFile} = createGlobalGitignoreConfig('logs/\n');
	setGitConfigGlobal(t, configFile);
	const projectDirectory = temporaryDirectory();

	writeFile(path.join(projectDirectory, 'index.js'));
	writeFile(path.join(projectDirectory, 'logs', 'important.log'));

	const result = await globby('**/*', {cwd: projectDirectory, globalGitignore: true, onlyFiles: false});
	t.deepEqual(result.sort(), ['index.js']);
});

test.serial('globalGitignore option - globbySync onlyFiles false does not return globally ignored directories', t => {
	const {configFile} = createGlobalGitignoreConfig('logs/\n');
	setGitConfigGlobal(t, configFile);
	const projectDirectory = temporaryDirectory();

	writeFile(path.join(projectDirectory, 'index.js'));
	writeFile(path.join(projectDirectory, 'logs', 'important.log'));

	t.deepEqual(globbySync('**/*', {cwd: projectDirectory, globalGitignore: true, onlyFiles: false}).sort(), ['index.js']);
});

test.serial('globalGitignore option - onlyFiles false respects provided fs adapter without statSync', async t => {
	const {configFile} = createGlobalGitignoreConfig('logs/\n');
	setGitConfigGlobal(t, configFile);
	const projectDirectory = temporaryDirectory();
	const fsImplementation = createContextAwareFs();

	fsImplementation.statSync = function () {
		throw new Error('sync stat should not be used');
	};

	writeFile(path.join(projectDirectory, 'index.js'));
	writeFile(path.join(projectDirectory, 'logs', 'important.log'));

	const result = await globby('**/*', {
		cwd: projectDirectory,
		fs: fsImplementation,
		globalGitignore: true,
		onlyFiles: false,
	});
	t.deepEqual(result.sort(), ['index.js']);
});

test.serial('globalGitignore option - globbyStream onlyFiles false respects provided fs adapter without statSync', async t => {
	const {configFile} = createGlobalGitignoreConfig('logs/\n');
	setGitConfigGlobal(t, configFile);
	const projectDirectory = temporaryDirectory();
	const fsImplementation = createContextAwareFs();

	fsImplementation.statSync = function () {
		throw new Error('sync stat should not be used');
	};

	writeFile(path.join(projectDirectory, 'index.js'));
	writeFile(path.join(projectDirectory, 'logs', 'important.log'));

	const result = [];
	for await (const file of globbyStream('**/*', {
		cwd: projectDirectory,
		fs: fsImplementation,
		globalGitignore: true,
		onlyFiles: false,
	})) {
		result.push(file);
	}

	t.deepEqual(result.sort(), ['index.js']);
});

test.serial('globalGitignore option - globbyStream keeps root-anchored patterns anchored to git root when fs adapter has no statSync', async t => {
	const repository = createTemporaryGitRepository();
	const subdirectory = path.join(repository, 'sub');
	const {configFile} = createGlobalGitignoreConfig('/build\n');
	const fsImplementation = createContextAwareFs();
	setGitConfigGlobal(t, configFile);
	fsImplementation.statSync = undefined;

	fs.mkdirSync(path.join(repository, 'build'), {recursive: true});
	fs.mkdirSync(path.join(subdirectory, 'build'), {recursive: true});
	fs.writeFileSync(path.join(repository, 'build', 'output.js'), '');
	fs.writeFileSync(path.join(subdirectory, 'build', 'output.js'), '');
	fs.writeFileSync(path.join(subdirectory, 'index.js'), '');

	const result = [];
	for await (const file of globbyStream('**/*', {cwd: subdirectory, fs: fsImplementation, globalGitignore: true})) {
		result.push(file);
	}

	t.deepEqual(result.sort(), ['build/output.js', 'index.js']);
});

test.serial('getGlobalGitignoreFile - recognizes case-insensitive [core] section', t => {
	const content = '*.log\n';
	const {globalIgnorePath} = createGlobalGitignoreConfig(content);
	const directory = temporaryDirectory();
	const configFile = path.join(directory, '.gitconfig');
	fs.writeFileSync(configFile, `[Core]\n\texcludesfile = ${globalIgnorePath}\n`, 'utf8');
	setGitConfigGlobal(t, configFile);

	t.deepEqual(getGlobalGitignoreFile(), {filePath: globalIgnorePath, content});
});

test.serial('getGlobalGitignoreFile - ignores excludesfile outside [core] section', t => {
	const homeDirectory = temporaryDirectory();
	const {globalIgnorePath} = createGlobalGitignoreConfig('*.log\n');
	const directory = temporaryDirectory();
	const configFile = path.join(directory, '.gitconfig');
	fs.writeFileSync(configFile, `[user]\n\texcludesfile = ${globalIgnorePath}\n`, 'utf8');
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		XDG_CONFIG_HOME: path.join(homeDirectory, '.config'),
	});
	setGitConfigGlobal(t, configFile);

	t.is(getGlobalGitignoreFile(), undefined);
});

test('buildGlobalPredicate - works when global ignore file path is inside cwd', t => {
	const projectDirectory = temporaryDirectory();
	const globalIgnorePath = path.join(projectDirectory, '.config', 'git', 'ignore');
	fs.mkdirSync(path.dirname(globalIgnorePath), {recursive: true});
	fs.writeFileSync(globalIgnorePath, '*.log\n', 'utf8');

	const globalIgnoreFile = {filePath: globalIgnorePath, content: '*.log\n'};
	const predicate = buildGlobalPredicate(globalIgnoreFile, projectDirectory);

	t.true(predicate(path.join(projectDirectory, 'debug.log')));
	t.true(predicate(path.join(projectDirectory, 'src', 'debug.log')));
	t.false(predicate(path.join(projectDirectory, 'src', 'index.js')));
});

test('buildGlobalPredicate - negation patterns in global gitignore work', t => {
	const projectDirectory = temporaryDirectory();
	const globalIgnoreFile = {
		filePath: path.join(os.homedir(), '.gitignore_global'),
		content: '*.log\n!important.log\n',
	};

	const predicate = buildGlobalPredicate(globalIgnoreFile, projectDirectory);

	t.true(predicate(path.join(projectDirectory, 'debug.log')));
	t.false(predicate(path.join(projectDirectory, 'important.log')));
	t.false(predicate(path.join(projectDirectory, 'src', 'index.js')));
});

test('buildGlobalPredicate - empty content does not ignore anything', t => {
	const projectDirectory = temporaryDirectory();
	const globalIgnoreFile = {
		filePath: path.join(os.homedir(), '.gitignore_global'),
		content: '',
	};

	const predicate = buildGlobalPredicate(globalIgnoreFile, projectDirectory);

	t.false(predicate(path.join(projectDirectory, 'debug.log')));
	t.false(predicate(path.join(projectDirectory, 'src', 'index.js')));
});

test('buildGlobalPredicate - comment-only content does not ignore anything', t => {
	const projectDirectory = temporaryDirectory();
	const globalIgnoreFile = {
		filePath: path.join(os.homedir(), '.gitignore_global'),
		content: '# This is a comment\n# Another comment\n',
	};

	const predicate = buildGlobalPredicate(globalIgnoreFile, projectDirectory);

	t.false(predicate(path.join(projectDirectory, 'debug.log')));
	t.false(predicate(path.join(projectDirectory, 'src', 'index.js')));
});

test.serial('getGlobalGitignoreFile - circular include does not infinite loop', t => {
	const directory = temporaryDirectory();
	const configFile = writeGitConfig(directory, `[include]\n\tpath = ${path.join(directory, '.gitconfig')}\n[core]\n\texcludesfile = nonexistent\n`);
	setGitConfigGlobal(t, configFile);

	t.is(getGlobalGitignoreFile(), undefined);
});

test.serial('getGlobalGitignoreFile - mutual circular includes do not infinite loop', t => {
	const directory = temporaryDirectory();
	const configA = path.join(directory, 'a.gitconfig');
	const configB = path.join(directory, 'b.gitconfig');
	writeFile(configA, `[include]\n\tpath = ${configB}\n`);
	writeFile(configB, `[include]\n\tpath = ${configA}\n[core]\n\texcludesfile = nonexistent\n`);
	setGitConfigGlobal(t, configA);

	t.is(getGlobalGitignoreFile(), undefined);
});

test.serial('getGlobalGitignoreFile - GIT_CONFIG_GLOBAL pointing to non-existent file returns undefined', t => {
	const homeDirectory = temporaryDirectory();
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		XDG_CONFIG_HOME: path.join(homeDirectory, '.config'),
	});
	setGitConfigGlobal(t, path.join(homeDirectory, 'nonexistent.gitconfig'));

	t.is(getGlobalGitignoreFile(), undefined);
});

test.serial('getGlobalGitignoreFileAsync - reads file content when configured correctly', async t => {
	const content = '*.log\n*.tmp\n';
	const {globalIgnorePath, configFile} = createGlobalGitignoreConfig(content);
	setGitConfigGlobal(t, configFile);

	t.deepEqual(await getGlobalGitignoreFileAsync(), {filePath: globalIgnorePath, content});
});

test.serial('getGlobalGitignoreFileAsync - ~/.gitconfig overrides XDG config', async t => {
	const homeDirectory = temporaryDirectory();
	const xdgConfigHome = path.join(homeDirectory, '.config');
	const xdgGlobalIgnorePath = writeGlobalGitignore(homeDirectory, 'xdg.gitignore_global', '*.log\n');
	const homeGlobalIgnorePath = writeGlobalGitignore(homeDirectory, '.gitignore_global', '*.tmp\n');
	writeGitConfig(xdgConfigHome, `[core]\n\texcludesfile = ${xdgGlobalIgnorePath}\n`, path.join('git', 'config'));
	writeGitConfig(homeDirectory, `[core]\n\texcludesfile = ${homeGlobalIgnorePath}\n`);
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		GIT_CONFIG_GLOBAL: undefined,
		XDG_CONFIG_HOME: xdgConfigHome,
	});

	t.deepEqual(await getGlobalGitignoreFileAsync(), {filePath: homeGlobalIgnorePath, content: '*.tmp\n'});
});

test.serial('getGlobalGitignoreFileAsync - GIT_CONFIG_GLOBAL empty string still uses default ignore file', async t => {
	const homeDirectory = temporaryDirectory();
	const defaultGlobalIgnorePath = writeGlobalGitignore(homeDirectory, path.join('.config', 'git', 'ignore'), '*.log\n');
	setHomeDirectoryEnvironmentVariables(t, homeDirectory);
	setEnvironmentVariables(t, {
		GIT_CONFIG_GLOBAL: '',
		XDG_CONFIG_HOME: path.join(homeDirectory, '.config'),
	});

	t.deepEqual(await getGlobalGitignoreFileAsync(), {filePath: defaultGlobalIgnorePath, content: '*.log\n'});
});

test.serial('globalGitignore option - negation in global gitignore un-ignores files', async t => {
	const {configFile} = createGlobalGitignoreConfig('*.log\n!important.log\n');
	setGitConfigGlobal(t, configFile);
	const projectDirectory = temporaryDirectory();

	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');
	fs.writeFileSync(path.join(projectDirectory, 'important.log'), '');

	const result = await globby('**/*', {cwd: projectDirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['important.log', 'index.js']);
});

test.serial('globalGitignore option - empty global gitignore does not ignore anything', async t => {
	const {configFile} = createGlobalGitignoreConfig('');
	setGitConfigGlobal(t, configFile);
	const projectDirectory = temporaryDirectory();

	fs.writeFileSync(path.join(projectDirectory, 'index.js'), '');
	fs.writeFileSync(path.join(projectDirectory, 'debug.log'), '');

	const result = await globby('**/*', {cwd: projectDirectory, globalGitignore: true});
	t.deepEqual(result.sort(), ['debug.log', 'index.js']);
});
