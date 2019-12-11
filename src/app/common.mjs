
import fs from "fs-extra";
import process from "process";
import path from "path";
import shell from "shelljs";

export async function exec (command, options = {}) {
	return new Promise((resolve, reject) => {
		shell.exec(command, Object.assign({async: true}, options), (code, stdout, stderr) => {
			if (code !== 0) {
				const error = new Error();
				error.message = stderr;
				error.name = String(code);
				reject(error);
			}
			else {
				resolve(stdout);
			}
		});
	});
}


export function fileExists (path) {
	try {
		if (fs.existsSync(path)) {
			return true;
		}
	}
	catch (err) {
		console.error(err);
	}
	return false;
}

export function getPackageDir () {
	let p = "./";
	let ex;
	while (!(ex = fileExists(path.resolve(process.cwd(), p, "package.json")), ex) && path.resolve(cwd, p) !== path.resolve("/")) {
		p = p === "./" ? "../" : `${p}../`;
	}
	if (ex) {
		return path.resolve(process.cwd(), p);
	}
}

export function getArg (...args) {
	const items = args.reduce((res, arg) => res = res.concat(arg), []);
	const findValue = (arr, fn) => {
		for (let i = 0; i < arr.length; i++) {
			const res = fn(arr[i], i);
			if (res != null) {
				return res;
			}
		}
	};
	const argv = process.argv.slice(2, process.argv.length);
	let i = 0;
	let indexed = 0;
	const params = {};
	while (i < argv.length) {
		const arg = argv[i];
		if (arg.match(/^-{1,2}[^\s-]+/)) {
			if (arg.includes("=")) {
				const v = arg.split(/\=(.+)/);
				params[v[0].replace(/^-{1,2}/, "")] = v[1];
				i += 1;
			}
			else if (!argv[i + 1] || argv[i + 1].match(/^-{1,2}[^\s]+/)) {
				params[arg.replace(/^-{1,2}/, "")] = true;
				i += 1;
			}
			else {
				params[arg.replace(/^-{1,2}/, "")] = argv[i + 1];
				i += 2;
			}
		}
		else if (!arg.startsWith("-")) {
			params[indexed] = arg;
			indexed++;
			i++;
		}
		else {
			i++;
		}
	}
	return findValue(items, item => params[item]);
}

export function transformCase (key, {format = "capitalize", delimiter = ""} = {}) {
	let parts;
	if (key.match(/\s+/)) {
		parts = key.toLowerCase().split(/\s+/g);
	}
	else {
		if ((key.toLowerCase() !== key.toUpperCase())) {
			parts = key.split(/(\p{Lu}|[-_]|\s+)/gu);
		}
		else {
			parts = key.toLowerCase().split(/([-_]|\s+)/g);
		}
	}
	// console.log("parts", parts);
	return parts.map((part, idx) => {
		switch (format) {
			case "lower": {
				return part.toLowerCase();
			}
			case "upper": {
				return part.toUpperCase();
			}
			case "camel": {
				return idx > 0 ? part.substr(0, 1).toUpperCase() + part.substr(1) : part;
			}
			case "capital": {
				return part.substr(0, 1).toUpperCase() + part.substr(1);
			}
		}
	}).join(delimiter);
}
