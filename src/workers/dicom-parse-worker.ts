// DICOMパースWorker — メインスレッドの同期パース停止を避ける
import * as dicomParserModule from "dicom-parser";
import type { DicomFileInfo } from "@/types/dicom";
import {
	buildDicomFileInfo,
	UnsupportedTransferSyntaxError,
} from "@/utils/dicom-parser";

type DicomDataSetLike = Parameters<typeof buildDicomFileInfo>[0];

type DicomParseWorkerRequest = {
	id: number;
	type: "parse";
	payload: {
		path: string;
		fileName: string;
		imageId: string;
		data: ArrayBuffer;
	};
};

type DicomParseWorkerSuccess = {
	id: number;
	type: "success";
	fileInfo: DicomFileInfo;
	rawData: ArrayBuffer;
};

type DicomParseWorkerError = {
	id: number;
	type: "error";
	error: {
		name: string;
		message: string;
		transferSyntaxUid?: string;
	};
};

type DicomParseWorkerResponse = DicomParseWorkerSuccess | DicomParseWorkerError;

type WorkerScope = {
	addEventListener: (
		eventName: "message",
		listener: (event: MessageEvent<DicomParseWorkerRequest>) => void,
	) => void;
	postMessage: (
		message: DicomParseWorkerResponse,
		transferList?: Transferable[],
	) => void;
};

const workerScope = globalThis as typeof globalThis & WorkerScope;

const toErrorEnvelope = (error: unknown): DicomParseWorkerError["error"] => {
	if (error instanceof UnsupportedTransferSyntaxError) {
		return {
			name: error.name,
			message: error.message,
			transferSyntaxUid: error.transferSyntaxUid,
		};
	}
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
		};
	}
	return {
		name: "Error",
		message: "不明なDICOMパースエラー",
	};
};

workerScope.addEventListener("message", (event) => {
	const message = event.data;
	if (message.type !== "parse") return;

	try {
		const dataSet = dicomParserModule.parseDicom(
			new Uint8Array(message.payload.data),
		) as DicomDataSetLike;
		const fileInfo = buildDicomFileInfo(
			dataSet,
			message.payload.imageId,
			message.payload.path,
			message.payload.fileName,
			message.payload.data,
		);
		const transferList: Transferable[] = [message.payload.data];
		if (fileInfo.thumbnailData) {
			transferList.push(fileInfo.thumbnailData.buffer);
		}
		workerScope.postMessage(
			{
				id: message.id,
				type: "success",
				fileInfo,
				rawData: message.payload.data,
			},
			transferList,
		);
	} catch (error) {
		workerScope.postMessage({
			id: message.id,
			type: "error",
			error: toErrorEnvelope(error),
		});
	}
});
