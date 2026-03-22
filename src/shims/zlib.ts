// dicom-parserのUMDラッパーがrequire("zlib")を呼ぶため、
// 空のzlibモジュールを提供する。
// dicom-parser内部ではzlibが使えない場合にpakoフォールバックが動作する（line 2273）。
export default {};
export const inflateRawSync = undefined;
