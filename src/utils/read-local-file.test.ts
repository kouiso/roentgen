import { describe, expect, it, vi } from "vitest";
import { FILE_READ_CHUNK_BYTES, readLocalFile } from "./read-local-file";

// 実際のチャンク (32 MB) で配列比較するとテストが重くなるため、小さいチャンクで検証する
const CHUNK = 64;

const makeBytes = (size: number) => {
	const bytes = new Uint8Array(size);
	for (let i = 0; i < size; i++) bytes[i] = i % 251;
	return bytes;
};

const makeRangeApi = (bytes: Uint8Array) => ({
	readFile: vi.fn(async () => bytes.slice().buffer),
	getFileSize: vi.fn(async () => bytes.byteLength),
	readFileRange: vi.fn(
		async (_filePath: string, offset: number, length: number) =>
			bytes.slice(offset, offset + length).buffer,
	),
});

describe("readLocalFile", () => {
	it("keeps each chunk within the main-process range limit", () => {
		expect(FILE_READ_CHUNK_BYTES).toBeLessThanOrEqual(64 * 1024 * 1024);
	});

	it("reads small files in one IPC call", async () => {
		const bytes = makeBytes(CHUNK);
		const api = makeRangeApi(bytes);

		const result = await readLocalFile(api, "/x.dcm", CHUNK);

		expect(new Uint8Array(result)).toEqual(bytes);
		expect(api.readFile).toHaveBeenCalledTimes(1);
		expect(api.readFileRange).not.toHaveBeenCalled();
	});

	it("assembles large files from bounded chunks", async () => {
		const bytes = makeBytes(CHUNK * 2 + 17);
		const api = makeRangeApi(bytes);

		const result = await readLocalFile(api, "/ct.dcm", CHUNK);

		expect(api.readFile).not.toHaveBeenCalled();
		expect(api.readFileRange.mock.calls.map((call) => call.slice(1))).toEqual([
			[0, CHUNK],
			[CHUNK, CHUNK],
			[CHUNK * 2, 17],
		]);
		expect(result.byteLength).toBe(bytes.byteLength);
		expect(new Uint8Array(result)).toEqual(bytes);
	});

	it("fails instead of returning a partially filled buffer when the file shrinks", async () => {
		const bytes = makeBytes(CHUNK + 10);
		const api = makeRangeApi(bytes);
		api.readFileRange.mockResolvedValueOnce(new ArrayBuffer(5));

		await expect(readLocalFile(api, "/ct.dcm", CHUNK)).rejects.toThrow(
			"読み込み中にファイルが変更されました",
		);
	});

	it("falls back to whole-file reads when the range API is unavailable", async () => {
		const bytes = makeBytes(CHUNK + 1);
		const readFile = vi.fn(async () => bytes.slice().buffer);

		const result = await readLocalFile({ readFile }, "/ct.dcm", CHUNK);

		expect(readFile).toHaveBeenCalledTimes(1);
		expect(result.byteLength).toBe(bytes.byteLength);
	});
});
