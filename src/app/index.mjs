import fs from "fs-extra";
import process from "process";
import path from "path";
import ssri from "ssri";
import globby from "globby";
import "colors";
import {getPackageDir, exec, getArg} from "./common.mjs";

const cwd = process.cwd();
// const packageDir = getPackageDir();

async function main () {
	try {
		const inputFilePattern = getArg(["i"]) || "src/video/**/*";
		const outputDir = getArg(["o"]) || "./va-video-result";
		console.log("inputFilePattern", inputFilePattern);
		console.log("outputDir", outputDir);
		const videoCodecs = ["vp9", "h264", "av1"];
		const videoContainers = ["webm", "mp4"];
		const audioFormats = ["ogg", "aac"];
		const imageFormats = ["png", "jpeg", "webp"];
		const settings = {
			fromTime: getArg(["from"]),
			toTime: getArg(["to"]),
			trimFromTime: getArg(["trim-from"]),
			trimToTime: getArg(["trim-to"]),
			video: getArg(["v"]),
			image: getArg(["img"]),
			imageFrames: getArg(["fr"]),
		};
		const createDurationParams = () => {
			const params = [];
			if (settings.fromTime) {
				params.push(`-ss ${settings.fromTime}`);
			}
			if (settings.toTime) {
				params.push(`-to ${settings.toTime}`);
			}
			return params.length ? params.join(" ") : "";
		};

		const options = {
			image: settings.image ? settings.image.split(",") : [],
			imageFrames: settings.imageFrames ? settings.imageFrames.split(",").map(i => +i) : [0],
			// imageFrames: sqnc(0, 100, 25).toArray(),
			video: settings.video ? settings.video.split(",") : [
				// "av1:webm:ogg",
				"vp9:webm:ogg:22",
				"h264:mp4:aac:15",
			],
			// audio: [],
		};

		await fs.remove(path.resolve(cwd, outputDir));
		await fs.ensureDir(path.resolve(cwd, outputDir));
		const pattenMatch = inputFilePattern.match(/(.*?)(\*.*)/i);
		const [_match, inputDir, inputFileNamePattern] = pattenMatch ? pattenMatch : [null, "./", inputFilePattern];
		const list = await globby([inputFileNamePattern], {cwd: path.resolve(cwd, inputDir)});

		await list.reduce(async (prev, item) => {
			await prev;
			const fullpath = path.resolve(cwd, inputDir, item);
			console.log(`Processing video file`.bgYellow.black, `${path.join(inputDir, item)}`.bgCyan.black);
			const durationStr = (await exec(`ffmpeg -i ${fullpath} 2>&1 | grep Duration | awk '{print $2}' | tr -d ,`, {silent: true})).toString().replace("\n", "");
			const duration = durationStr.split(":").reduce((res, i, idx) => {
				res += parseFloat(i) * [60 * 60 * 100, 60 * 100, 100][idx];
				return res;
			}, 0);
			console.log(`Video duration ${durationStr} (${duration}ms)`.green);
			const outputFileName = path.resolve(cwd, outputDir, item).split(".").slice(0, -1).join(".");
			const outputFileNameRelative = path.join(outputDir, item).split(".").slice(0, -1).join(".");
			if (options.image) {
				const frames = (options.imageFrames || [0]);
				await options.image.reduce(async (prev, imageFormat) => {
					await prev;
					console.log(`Extracting ${imageFormat.toUpperCase().bold} image frames`.bgGreen.black);
					await frames.reduce(async (prev, step) => {
						await prev;
						await exec(`ffmpeg -ss ${(duration / 100 / 100) * step} -i ${fullpath} -vf select="eq(pict_type\\,I)" -vsync vfr -vframes 1 -y ${outputFileName}${frames.length === 1 || step === 0 ? "" : `-${step}`}.${imageFormat}`, {silent: true});
					}, {});
				}, {});
			}


			if ((options.audio || []).includes("ogg") || (options.video || []).some(vf => vf.split(":")[2] === "ogg")) {
				// EXTRACT AUDIO TO OGG VORBIS FILE
				console.log(`Extracting ${"OGG".bold} audio`.bgRed.black);
				await exec(`ffmpeg -i ${fullpath} -threads 8 -c:a libopus -vn -y ${createDurationParams()} ${outputFileName}-audio.ogg`, {silent: true});
				console.log(`Created audio file`, `${outputFileNameRelative}-audio.ogg`.cyan);
			}
			if ((options.audio || []).includes("aac") || (options.video || []).some(vf => vf.split(":")[2] === "aac")) {
				// EXTRACT AUDIO TO AAC FILE
				console.log(`Extracting ${"AAC".bold} audio`.bgRed.black);
				await exec(`ffmpeg -i ${fullpath} -threads 8 -c:a aac -q:a 1.68 -strict experimental -vn -y ${createDurationParams()} ${outputFileName}-audio.aac`, {silent: true});
				console.log(`Created audio file`, `${outputFileNameRelative}-audio.aac`.cyan);
			}


			const videoEncodeList = {
				vp9: async (codec, videoFormat = "webm", audioFormat, compression = 30, size = 1280) => {
					// COVERT TO WEBM
					// webm high compression / 720p
					/** TODO: add scale filter param "force_divisible_by=2" when it come to release version of ffmpeg
						https://ffmpeg.org/ffmpeg-filters.html#scale
						https://github.com/FFmpeg/FFmpeg/commit/74d4bc0fa0e0f63b89ce020893c61e6703f3f282#diff-56d7f69a46ab93e60d770e21687cf4c2R250
					**/
					size = +size;
					console.log(`Converting to ${codec.toUpperCase().bold}:${videoFormat.toUpperCase().bold} video (size: ${size}, compression: ${compression})`.bgBlue.white);

					const filters = [];
					const final = "result";

					if (size) {
						filters.push(`[0:v]scale=w=${size}:h=${size}:force_original_aspect_ratio=decrease[x];[x]scale=trunc(iw/2)*2:trunc(ih/2)*2[result]`);
					}
					// filters.push(`[scaled]split[scaled1][scaled2]`);
					// filters.push(`[scaled1]trim=start=0.0:end=24.0,setpts=PTS-STARTPTS[1v]`);
					// filters.push(`[scaled2]trim=start=28.0:end=41,setpts=PTS-STARTPTS[2v]`);
					// filters.push(`[1v][2v]concat[y]`);
					// filters.push("[y][1:v]overlay[ov]");
					// filters.push(`[ov]fade=type=out:start_time=36.5:duration=5.5[result]`);
					let audioFilterStr;
					// audioFilterStr = `afade=type=out:start_time=36.5:duration=5.5`;
					const filtersStr = filters.map((filter, idx) => `${filter}${idx < filters.length - 1 ? ";" : ""}`).join("").trim();
					const cmd = `ffmpeg -i ${fullpath} -f lavfi -i nullsrc=s=1x1:d=42 -c:v libvpx-vp9 -crf ${compression} -b:v 0 -filter_complex '${filtersStr}' -map '[${final}]' -an -y ${createDurationParams()} ${outputFileName}-video[${size}-${compression}].${codec}.${videoFormat}`;

					await exec(cmd, {silent: true});
					console.log(`Created video file (without audio)`, `${outputFileNameRelative}-video[${size}-${compression}].${codec}.${videoFormat}`.cyan);
					console.log([...(audioFormat ? [`Appending ${audioFormat.toUpperCase()} audio to video`] : []), `Optimizimg for web`].join(" + ").red);
					await exec(`ffmpeg -i ${outputFileName}-video[${size}-${compression}].${codec}.${videoFormat} ${audioFormat ? `-i ${outputFileName}-audio.${audioFormat}` : "-an"} -shortest -movflags +faststart -map_metadata -1 -write_tmcd 0  -c:v copy ${audioFormat && audioFilterStr ? `-af "${audioFilterStr}"` : `-c:a copy`} -y ${outputFileName}[${size}-${compression}].${codec}${audioFormat ? `-${audioFormat}` : ""}.${videoFormat}`, {silent: true});
					console.log(`Created video file`, `${outputFileNameRelative}[${size}-${compression}].${codec}${audioFormat ? `-${audioFormat}` : ""}.${videoFormat}`.cyan);
				},
				"h264": async (codec, videoFormat = "mp4", audioFormat, compression = 26, size = 1280) => {
					// CONVERT TO MP4
					// mp4 high compression / 720p
					/** TODO: add scale filter param "force_divisible_by=2" when it come to release version of ffmpeg
						https://ffmpeg.org/ffmpeg-filters.html#scale
						https://github.com/FFmpeg/FFmpeg/commit/74d4bc0fa0e0f63b89ce020893c61e6703f3f282#diff-56d7f69a46ab93e60d770e21687cf4c2R250
					**/
					size = +size;
					console.log(`Converting to ${codec.toUpperCase().bold}:${videoFormat.toUpperCase().bold} video (size: ${size}, compression: ${compression})`.bgBlue.white);

					const filters = [];
					const final = "result";

					if (size) {
						filters.push(`[0:v]scale=w=${size}:h=${size}:force_original_aspect_ratio=decrease[x];[x]scale=trunc(iw/2)*2:trunc(ih/2)*2[result]`);
					}
					// filters.push(`[scaled]split[scaled1][scaled2]`);
					// filters.push(`[scaled1]trim=start=0.0:end=24.0,setpts=PTS-STARTPTS[1v]`);
					// filters.push(`[scaled2]trim=start=28.0:end=41,setpts=PTS-STARTPTS[2v]`);
					// filters.push(`[1v][2v]concat[y]`);
					// filters.push("[y][1:v]overlay[ov]");
					// filters.push(`[ov]fade=type=out:start_time=36.5:duration=5.5[result]`);

					let audioFilterStr;
					// audioFilterStr = `afade=type=out:start_time=36.5:duration=5.5`;
					const filtersStr = filters.map((filter, idx) => `${filter}${idx < filters.length - 1 ? ";" : ""}`).join("").trim();
					const cmd = `ffmpeg -i ${fullpath} -f lavfi -i nullsrc=s=1x1:d=42 -threads 8 -c:v libx264 -crf ${compression} -maxrate 20M -bufsize 25M -preset veryslow -tune fastdecode -profile:v main -level 4.0 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -an -y ${createDurationParams()} -filter_complex '${filtersStr}' -map '[${final}]' ${outputFileName}-video[${size}-${compression}].${codec}.${videoFormat}`;
					// console.log(cmd);
					await exec(cmd, {silent: true});
					console.log(`Created video file (without audio)`, `${outputFileNameRelative}-video[${size}-${compression}].${codec}.${videoFormat}`.cyan);
					console.log([...(audioFormat ? [`Appending ${audioFormat.toUpperCase()} audio to video`] : []), `Optimizimg for web`].join(" + ").red);
					await exec(`ffmpeg -i ${outputFileName}-video[${size}-${compression}].${codec}.${videoFormat} ${audioFormat ? `-i ${outputFileName}-audio.${audioFormat}` : "-an"} ${audioFormat && audioFilterStr ? `-af "${audioFilterStr}"` : `-c:a copy`} -shortest -movflags +faststart -map_metadata -1 -write_tmcd 0  -c:v copy -y ${outputFileName}[${size}-${compression}].${codec}${audioFormat ? `-${audioFormat}` : ""}.${videoFormat}`, {silent: true});
					console.log(`Created video file`, `${outputFileNameRelative}[${size}-${compression}].${codec}${audioFormat ? `-${audioFormat}` : ""}.${videoFormat}`.cyan);
				},
				"av1": async (codec, videoFormat, audioFormat) => {
					console.log(`Converting to ${"AV1".bold} video (scaled to 720p)`.bgBlue.black);
					await exec(`ffmpeg -i ${fullpath} -threads 8 -c:v libaom-av1 -cpu-used 4 -crf 30 -b:v 0 -vf "scale=w=1280:h=1280:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2" -strict experimental -an -y ${outputFileName}-video.av1.webm`);
				},
			};

			if (options.video) {
				await options.video.reduce(async (prev, videoCodec) => {
					await prev;
					const [codec, videoFormat, audioFormat, compression, size] = videoCodec.split(":");
					await videoEncodeList[codec](codec, videoFormat, audioFormat, compression, size);
				}, {});
			}


			// await exec(``, {silent: true});

		}, {});
	}
	catch (error) {
		console.log("error", error);
	}
}

main();
