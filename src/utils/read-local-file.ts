type LocalFileApi = {
	readFile: (filePath: string) => Promise<ArrayBuffer>;
	getFileSize?: (filePath: string) => Promise<number>;
	readFileRange?: (
		filePath: string,
		offset: number,
		length: number,
	) => Promise<ArrayBuffer>;
};

// メイン側の MAX_FILE_RANGE_BYTES 以下にする。IPC の一時メモリは
// 1 回の転送量に比例するため、数百 MB の CT を一括で受け取るとレンダラーが数 GB に膨らむ。
export const FILE_READ_CHUNK_BYTES = 32 * 1024 * 1024;

export const readLocalFile = async (
	api: LocalFileApi,
	filePath: string,
	chunkBytes = FILE_READ_CHUNK_BYTES,
): Promise<ArrayBuffer> => {
	if (!api.getFileSize || !api.readFileRange) return api.readFile(filePath);

	const size = await api.getFileSize(filePath);
	if (size <= chunkBytes) return api.readFile(filePath);

	const bytes = new Uint8Array(size);
	for (let offset = 0; offset < size; offset += chunkBytes) {
		const length = Math.min(chunkBytes, size - offset);
		const chunk = await api.readFileRange(filePath, offset, length);
		if (chunk.byteLength !== length) {
			throw new Error(`読み込み中にファイルが変更されました: ${filePath}`);
		}
		bytes.set(new Uint8Array(chunk), offset);
	}
	return bytes.buffer;
};
