export const isNegativePattern = pattern => pattern[0] === '!';

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
