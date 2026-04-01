// 単一ペインのビューア描画コンポーネント
// ControlPanelなし — DicomViewerがControlPanelを管理し、ViewerPaneは描画に集中
import type { ViewerPaneHandle } from "@/hooks/useViewerPane";
import type { DicomFileInfo } from "@/types/dicom";
import { ImageDirection } from "./ImageDirection";
import { ImageOverlay } from "./ImageOverlay";
import { MeasurementOverlay } from "./MeasurementOverlay";
import { SeriesPanel } from "./SeriesPanel";
import { StackSlider } from "./StackSlider";
import { StackView } from "./StackView";

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
				isActive ? "ring-1 ring-blue-500/40" : ""
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
