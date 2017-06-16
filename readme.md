# globby [![Build Status](https://travis-ci.org/sindresorhus/globby.svg?branch=master)](https://travis-ci.org/sindresorhus/globby)

> User-friendly glob matching

Based on [`glob`](https://github.com/isaacs/node-glob), but adds a bunch of useful features and a nicer API.


## Features

- Promise API
- Supports multiple patterns
- Supports negated patterns → `['foo*', '!foobar']`


## Install

```
$ npm install --save globby
```


## Usage

```
├── unicorn
├── cake
└── rainbow
```

```js
const globby = require('globby');

globby(['*', '!cake']).then(paths => {
	console.log(paths);
	//=> ['unicorn', 'rainbow']
});
```


## API

### globby(patterns, [options])

Returns a `Promise<Array>` of matching paths.

### globby.sync(patterns, [options])

Returns an `Array` of matching paths.

### globby.generateGlobTasks(patterns, [options])

Returns an `Array<Object>` in the format `{ pattern: string, opts: Object }`, which can be passed as arguments to [`node-glob`](https://github.com/isaacs/node-glob). This is useful for other globbing-related packages.

Note that you should avoid running the same tasks multiple times as they contain a file system cache. Instead, run this method each time to ensure file system changes are taken into consideration.

### globby.hasMagic(patterns, [options])

Returns a `boolean` of whether there are any special glob characters in the `patterns`.

Note that the options affect the results. If `noext: true` is set, then `+(a|b)` will not be considered a magic pattern. If the pattern has a brace expansion, like `a/{b/c,x/y}`, then that is considered magical, unless `nobrace: true` is set.

#### patterns

Type: `string` `Array`

See supported `minimatch` [patterns](https://github.com/isaacs/minimatch#usage).

#### options

Type: `Object`

See the [`node-glob` options](https://github.com/isaacs/node-glob#options).


## Globbing patterns

Just a quick overview.

- `*` matches any number of characters, but not `/`
- `?` matches a single character, but not `/`
- `**` matches any number of characters, including `/`, as long as it's the only thing in a path part
- `{}` allows for a comma-separated list of "or" expressions
- `!` at the beginning of a pattern will negate the match

[Various patterns and expected matches.](https://github.com/sindresorhus/multimatch/blob/master/test/test.js)


## Related

- [multimatch](https://github.com/sindresorhus/multimatch) - Match against a list instead of the filesystem
- [matcher](https://github.com/sindresorhus/matcher) - Simple wildcard matching
- [del](https://github.com/sindresorhus/del) - Delete files and directories
- [make-dir](https://github.com/sindresorhus/make-dir) - Make a directory and its parents if needed


## License

MIT © [Sindre Sorhus](https://sindresorhus.com)
