import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer, type ViteDevServer } from "vite";
import renderer from "vite-plugin-electron-renderer";

export const repoRoot = resolve(__dirname, "../..");
export const electronMainPath = resolve(repoRoot, "dist-electron/main.js");

export const buildElectronApp = () => {
	execFileSync("pnpm", ["build"], {
		cwd: repoRoot,
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
		stdio: "inherit",
	});
};

export type RendererDevServer = {
	url: string;
	close: () => Promise<void>;
};

export const startRendererDevServer = async (): Promise<RendererDevServer> => {
	const server: ViteDevServer = await createServer({
		configFile: false,
		root: repoRoot,
		server: {
			host: "127.0.0.1",
			port: 0,
			strictPort: false,
		},
		plugins: [react(), tailwindcss(), renderer()],
		resolve: {
			alias: {
				"@": resolve(repoRoot, "src"),
				zlib: resolve(repoRoot, "src/shims/zlib.ts"),
			},
		},
	});

	await server.listen();
	const url = server.resolvedUrls?.local[0];
	if (!url) {
		await server.close();
		throw new Error("Vite renderer dev server did not expose a local URL");
	}

	return {
		url,
		close: () => server.close(),
	};
};
