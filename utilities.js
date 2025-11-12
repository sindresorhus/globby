export const isNegativePattern = pattern => pattern[0] === '!';

export const bindFsMethod = (object, methodName) => {
	const method = object?.[methodName];
	return typeof method === 'function' ? method.bind(object) : undefined;
};

export const normalizeDirectoryPatternForFastGlob = pattern => {
	if (!pattern.endsWith('/')) {
		return pattern;
	}

	const trimmedPattern = pattern.replace(/\/+$/u, '');
	if (!trimmedPattern) {
		return '/**';
	}

	const hasLeadingSlash = trimmedPattern.startsWith('/');
	const patternBody = hasLeadingSlash ? trimmedPattern.slice(1) : trimmedPattern;
	const hasInnerSlash = patternBody.includes('/');
	const needsRecursivePrefix = !hasLeadingSlash && !hasInnerSlash && !trimmedPattern.startsWith('**/');
	const recursivePrefix = needsRecursivePrefix ? '**/' : '';

	return `${recursivePrefix}${trimmedPattern}/**`;
};

/**
Extract the parent directory prefix from a pattern (e.g., '../' or '../../').

Note: Patterns should have trailing slash after '..' (e.g., '../foo' not '..foo'). The directoryToGlob function ensures this in the normal pipeline.

@param {string} pattern - The pattern to analyze.
@returns {string} The parent directory prefix, or empty string if none.
*/
export const getParentDirectoryPrefix = pattern => {
	const normalizedPattern = isNegativePattern(pattern) ? pattern.slice(1) : pattern;
	const match = normalizedPattern.match(/^(\.\.\/)+/);
	return match ? match[0] : '';
};

/**
Adjust ignore patterns to match the relative base of the main patterns.

When patterns reference parent directories, ignore patterns starting with globstars need to be adjusted to match from the same base directory. This ensures intuitive behavior where ignore patterns work correctly with parent directory patterns.

This is analogous to how node-glob normalizes path prefixes (see node-glob issue #309) and how Rust ignore crate strips path prefixes before matching.

@param {string[]} patterns - The main glob patterns.
@param {string[]} ignorePatterns - The ignore patterns to adjust.
@returns {string[]} Adjusted ignore patterns.
*/
export const adjustIgnorePatternsForParentDirectories = (patterns, ignorePatterns) => {
	// Early exit for empty arrays
	if (patterns.length === 0 || ignorePatterns.length === 0) {
		return ignorePatterns;
	}

	// Get parent directory prefixes for all patterns (empty string if no prefix)
	const parentPrefixes = patterns.map(pattern => getParentDirectoryPrefix(pattern));

	// Check if all patterns have the same parent prefix
	const firstPrefix = parentPrefixes[0];
	if (!firstPrefix) {
		return ignorePatterns; // No parent directories in any pattern
	}

	const allSamePrefix = parentPrefixes.every(prefix => prefix === firstPrefix);
	if (!allSamePrefix) {
		return ignorePatterns; // Mixed bases - don't adjust
	}

	// Adjust ignore patterns that start with **/
	return ignorePatterns.map(pattern => {
		// Only adjust patterns starting with **/ that don't already have a parent reference
		if (pattern.startsWith('**/') && !pattern.startsWith('../')) {
			return firstPrefix + pattern;
		}

		return pattern;
	});
};
