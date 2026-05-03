import { createReadStream, existsSync, statSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cornerstoneCodecSourceDir = resolve(
	__dirname,
	"node_modules/cornerstone-wado-image-loader/dist/dynamic-import",
);

const getContentType = (filePath: string): string => {
	if (filePath.endsWith(".wasm")) return "application/wasm";
	if (filePath.endsWith(".js")) return "text/javascript";
	if (filePath.endsWith(".map")) return "application/json";
	return "application/octet-stream";
};

const cornerstoneCodecAssets = (): Plugin => {
	let outDir = resolve(__dirname, "dist");

	return {
		name: "roentgen-cornerstone-codec-assets",
		configResolved(config) {
			outDir = resolve(config.root, config.build.outDir);
		},
		configureServer(server) {
			server.middlewares.use("/cornerstone-wado", (req, res, next) => {
				const requestPath = decodeURIComponent(
					req.url?.split("?")[0]?.replace(/^\/+/, "") ?? "",
				);
				const assetPath = resolve(cornerstoneCodecSourceDir, requestPath);
				if (!assetPath.startsWith(cornerstoneCodecSourceDir)) {
					next();
					return;
				}
				if (!existsSync(assetPath) || !statSync(assetPath).isFile()) {
					next();
					return;
				}

				res.setHeader("Content-Type", getContentType(assetPath));
				createReadStream(assetPath).pipe(res);
			});
		},
		async writeBundle() {
			const targetDir = resolve(outDir, "cornerstone-wado");
			await mkdir(targetDir, { recursive: true });
			await cp(cornerstoneCodecSourceDir, targetDir, {
				recursive: true,
				force: true,
			});
		},
	};
};

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		cornerstoneCodecAssets(),
		electron([
			{
				entry: "electron/main.ts",
				onstart(args) {
					// ELECTRON_RUN_AS_NODE=1 が親プロセス（Claude Code等）から継承されると
					// Electron が Node.js モードで起動し、BrowserWindow が作れない。
					// spawn に渡す env から明示的に除外する。
					const { ELECTRON_RUN_AS_NODE: _, ...cleanEnv } = process.env;
					const spawnOptions = { env: cleanEnv };

					args.startup(
						process.env.VSCODE_DEBUG
							? [
									".",
									"--no-sandbox",
									"--inspect=9229",
									"--remote-debugging-port=9222",
								]
							: [".", "--no-sandbox", "--remote-debugging-port=9224"],
						spawnOptions,
					);
				},
				vite: {
					build: {
						outDir: "dist-electron",
						sourcemap: true,
					},
				},
			},
			{
				entry: "electron/preload.ts",
				onstart(args) {
					args.reload();
				},
				vite: {
					build: {
						outDir: "dist-electron",
						sourcemap: true,
					},
				},
			},
		]),
		renderer(),
	],
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
			zlib: resolve(__dirname, "src/shims/zlib.ts"),
		},
	},
});
