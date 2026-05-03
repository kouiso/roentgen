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
						<ImageOverlay
							overlayInfo={pane.overlayInfo}
							visible={pane.showOverlay}
						/>
						<ImageDirection
							directionInfo={pane.directionInfo}
							visible={pane.showDirection}
						/>
						<MeasurementOverlay
							measurements={pane.measurements}
							activePoints={pane.activePoints}
							imageWidth={pane.imageWidth}
							containerId={pane.containerId}
							viewport={pane.getViewport()}
							onRemoveMeasurement={pane.removeMeasurement}
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
