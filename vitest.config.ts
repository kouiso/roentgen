import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Node 25 以降は Web Storage を標準で持つ。vitest は「global に同名があれば
// DOM 環境側の定義で上書きしない」ので、happy-dom の localStorage が入らず
// localStorage.clear が関数にならない。Node 側を切って DOM 環境のものを使う。
// 旗が無い版（20 など）に渡すと起動に失敗するため、使える版にだけ渡す
const webStorageOff = "--no-experimental-webstorage";
const execArgv = process.allowedNodeEnvironmentFlags.has(webStorageOff)
	? [webStorageOff]
	: [];

export default defineConfig({
	test: {
		globals: true,
		execArgv,
		environment: "node",
		include: ["src/**/*.test.{ts,tsx}", "electron/**/*.test.{ts,tsx}"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,tsx}"],
			exclude: ["src/main.tsx", "src/**/*.d.ts"],
		},
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
});
