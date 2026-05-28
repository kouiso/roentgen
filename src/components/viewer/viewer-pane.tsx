// 単一ペインのビューア描画コンポーネント
// ControlPanelなし — DicomViewerがControlPanelを管理し、ViewerPaneは描画に集中
import type { ViewerPaneHandle } from "@/hooks/use-viewer-pane";
import type { DicomFileInfo } from "@/types/dicom";
import { AnnotationOverlay } from "./annotation-overlay";
import { ImageDirection } from "./image-direction";
import { ImageOverlay } from "./image-overlay";
import { MeasurementOverlay } from "./measurement-overlay";
import { SeriesPanel } from "./series-panel";
import { StackSlider } from "./stack-slider";
import { StackView } from "./stack-view";

type ViewerPaneProps = {
	pane: ViewerPaneHandle;
	files: DicomFileInfo[];
	isActive: boolean;
	onFocus: () => void;
};

export const ImageRenderErrorBanner = ({ message }: { message: string }) => (
	<div
		className="pointer-events-none absolute left-3 top-3 z-40 max-w-[min(24rem,calc(100%-1.5rem))] rounded border border-rose-400/25 bg-rose-950/80 px-3 py-2 text-xs text-rose-100 shadow-lg"
		role="alert"
	>
		<p className="font-semibold">画像表示に失敗しました</p>
		<p className="mt-1 text-[11px] text-rose-200/90">{message}</p>
		<p className="mt-1 text-[11px] text-rose-200/75">
			別フレームを選択するか、ファイルを読み込み直してください。
		</p>
	</div>
);

export const ViewerPane = ({
	pane,
	files,
	isActive,
	onFocus,
}: ViewerPaneProps) => {
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: ペインフォーカスのクリック検出用
		// biome-ignore lint/a11y/noStaticElementInteractions: ペインフォーカスのクリック検出用
		<div
			className={`relative flex min-h-0 flex-1 flex-col ${
				isActive ? "ring-1 ring-sky-400/40" : ""
			}`}
			onClick={onFocus}
		>
			<div className="flex min-h-0 flex-1">
				<div className="relative flex min-h-0 flex-1 flex-col">
					<div className="relative flex-1">
						<StackView
							containerId={pane.containerId}
							onViewerReady={pane.initViewer}
						/>
						{pane.imageLoadError && (
							<ImageRenderErrorBanner message={pane.imageLoadError} />
						)}
						<ImageOverlay
							overlayInfo={pane.overlayInfo}
							visible={pane.showOverlay}
						/>
						<ImageDirection
							directionInfo={pane.directionInfo}
							visible={pane.showDirection}
							species={pane.species}
						/>
						<MeasurementOverlay
							measurements={pane.measurements}
							activePoints={pane.activePoints}
							imageWidth={pane.imageWidth}
							containerId={pane.containerId}
							viewport={pane.getViewport()}
							onRemoveMeasurement={pane.removeMeasurement}
							onRestoreMeasurement={pane.restoreMeasurement}
							visible={true}
						/>
						<AnnotationOverlay
							annotations={pane.annotations}
							activePoints={pane.activeAnnotationPoints}
							pendingTextPosition={pane.pendingTextPosition}
							imageWidth={pane.imageWidth}
							imageHeight={pane.imageHeight}
							containerId={pane.containerId}
							viewport={pane.getViewport()}
							onRemoveAnnotation={pane.removeAnnotation}
							onRestoreAnnotation={pane.restoreAnnotation}
							onSubmitTextAnnotation={pane.submitTextAnnotation}
							onCancelPendingText={pane.cancelPendingText}
							visible={true}
						/>
					</div>

					<StackSlider
						currentFrame={pane.sliderState.currentFrame}
						maxFrame={pane.sliderState.maxFrame}
						onFrameChange={pane.handleFrameChange}
						onNext={pane.nextFrame}
						onPrev={pane.prevFrame}
					/>
				</div>

				<SeriesPanel
					files={files}
					currentIndex={pane.sliderState.currentFrame}
					onSelect={pane.handleThumbnailSelect}
				/>
			</div>
		</div>
	);
};
