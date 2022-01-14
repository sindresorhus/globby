import {fileURLToPath} from 'node:url';

const toPath = urlOrPath => {
	if (urlOrPath instanceof URL) {
		urlOrPath = urlOrPath.href;
	}

	return urlOrPath.startsWith('file:') ? fileURLToPath(urlOrPath) : urlOrPath;
};

export default toPath;
