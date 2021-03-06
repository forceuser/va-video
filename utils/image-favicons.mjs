import jimp from "jimp";
import toIco from "to-ico";
import fs from "fs-extra";
import process from "process";
import path from "path";

const cwd = process.cwd();
function fileExists (path) {
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

function getPackageDir () {
	let p = "./";
	let ex;
	while (!(ex = fileExists(path.resolve(cwd, p, "package.json")), ex) && path.resolve(cwd, p) !== path.resolve("/")) {
		p = p === "./" ? "../" : `${p}../`;
	}
	if (ex) {
		return path.resolve(cwd, p);
	}
}

const packageDir = getPackageDir();
const sizes = [48, 57, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];

async function main () {
	const fileData = await fs.readFile(path.resolve(packageDir, "dist/img/favicon/icon-src.png"));
	const iconData = await toIco([fileData], {resize: true, sizes: [16]});
	await fs.writeFile(path.resolve(packageDir, "dist/favicon.ico"), iconData);
	await fs.writeFile(path.resolve(packageDir, "dist/img/favicon/icon-16x16.ico"), iconData);

	jimp
		.read(path.resolve(packageDir, "dist/img/favicon/icon-src.png"))
		.then(image => {
			return sizes.reduce(async (prev, size) => {
				console.log("size", size);
				await prev;
				await image
					.clone()
					.resize(size, size)
					.write(path.resolve(packageDir, `dist/img/favicon/icon-${size}x${size}.png`));
			}, {});
		})
		.catch(error => {
			console.log("error", error);
		});
}

main();

