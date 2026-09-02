import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnnotationOverlay } from "@/components/viewer/annotation-overlay";
import { MeasurementOverlay } from "@/components/viewer/measurement-overlay";
import "../app.css";

type ViewportPoint = { x: number; y: number };
type ViewportState = {
	zoom: number;
	center: ViewportPoint;
};
type ViewportHandler = () => void;
type OverlayPixelApi = {
	setSize: (width: number, height: number) => void;
	setViewport: (state: Partial<ViewportState>) => void;
};

declare global {
	interface Window {
		__roentgenOverlayPixel?: OverlayPixelApi;
	}
}

const IMAGE_WIDTH = 1000;
const IMAGE_HEIGHT = 500;
const CONTAINER_ID = "overlay-fixture";

const createViewport = (stateRef: React.RefObject<ViewportState>) => {
	const handlers = new Map<string, Set<ViewportHandler>>();
	const emit = () => {
		for (const entries of handlers.values()) {
			for (const handler of entries) handler();
		}
	};

	return {
		getZoom: () => stateRef.current?.zoom ?? 1,
		getCenter: () => stateRef.current?.center ?? { x: 0.5, y: 0.25 },
		getHomeBounds: () => ({ x: 0, y: 0, width: 1, height: 0.5 }),
		addHandler: (eventName: string, handler: ViewportHandler) => {
			const entries = handlers.get(eventName) ?? new Set<ViewportHandler>();
			entries.add(handler);
			handlers.set(eventName, entries);
		},
		removeHandler: (eventName: string, handler: ViewportHandler) => {
			handlers.get(eventName)?.delete(handler);
		},
		emit,
	};
};

const drawImageCanvas = (
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
) => {
	const context = canvas.getContext("2d");
	if (!context) return;

	const gradient = context.createLinearGradient(0, 0, width, height);
	gradient.addColorStop(0, "#101718");
	gradient.addColorStop(0.55, "#24383b");
	gradient.addColorStop(1, "#111918");
	context.fillStyle = gradient;
	context.fillRect(0, 0, width, height);

	context.strokeStyle = "rgba(128, 229, 214, 0.28)";
	context.lineWidth = 1;
	for (let x = 0; x <= width; x += width / 5) {
		context.beginPath();
		context.moveTo(x, 0);
		context.lineTo(x, height);
		context.stroke();
	}
	for (let y = 0; y <= height; y += height / 5) {
		context.beginPath();
		context.moveTo(0, y);
		context.lineTo(width, y);
		context.stroke();
	}
};

const OverlayPixelFixture = () => {
	const [size, setSize] = useState({ width: 500, height: 250 });
	const viewportStateRef = useRef<ViewportState>({
		zoom: 1,
		center: { x: 0.5, y: 0.25 },
	});
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const viewport = useMemo(() => createViewport(viewportStateRef), []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		drawImageCanvas(canvas, size.width, size.height);
	}, [size.width, size.height]);

	useEffect(() => {
		// 実際のOpenSeadragonは画像読み込み完了時に "open" 由来のviewportイベントを
		// 発火し、AnnotationOverlay/MeasurementOverlayの初回描画を促す。fixtureの
		// モックviewportは何もしなければ初回イベントを発火しないため、ここで模擬する。
		requestAnimationFrame(() => viewport.emit());
	}, [viewport]);

	useEffect(() => {
		window.__roentgenOverlayPixel = {
			setSize: (width, height) => {
				setSize({ width, height });
				requestAnimationFrame(() => viewport.emit());
			},
			setViewport: (state) => {
				viewportStateRef.current = {
					zoom: state.zoom ?? viewportStateRef.current.zoom,
					center: state.center ?? viewportStateRef.current.center,
				};
				viewport.emit();
			},
		};
		return () => {
			delete window.__roentgenOverlayPixel;
		};
	}, [viewport]);

	return (
		<div
			style={{
				minHeight: "100vh",
				margin: 0,
				padding: 20,
				background: "#070b0c",
			}}
		>
			<div
				id={CONTAINER_ID}
				data-testid="overlay-fixture"
				style={{
					position: "relative",
					width: size.width,
					height: size.height,
					overflow: "hidden",
					background: "#101718",
				}}
			>
				<canvas
					ref={canvasRef}
					width={size.width}
					height={size.height}
					style={{
						position: "absolute",
						inset: 0,
						width: "100%",
						height: "100%",
					}}
				/>
				<MeasurementOverlay
					measurements={[
						{
							id: "distance-pixel",
							type: "distance",
							points: [
								{ x: 200, y: 100 },
								{ x: 600, y: 300 },
							],
							distanceMm: 223.6,
							color: "#ff1a1a",
						},
					]}
					activePoints={[]}
					imageWidth={IMAGE_WIDTH}
					containerId={CONTAINER_ID}
					viewport={viewport}
					onRemoveMeasurement={() => undefined}
					visible={true}
				/>
				<AnnotationOverlay
					annotations={[
						{
							id: "arrow-pixel",
							type: "arrow",
							start: { x: 300, y: 150 },
							end: { x: 360, y: 150 },
							color: "#ffd700",
						},
					]}
					activePoints={[]}
					pendingTextPosition={null}
					imageWidth={IMAGE_WIDTH}
					imageHeight={IMAGE_HEIGHT}
					containerId={CONTAINER_ID}
					viewport={viewport}
					onRemoveAnnotation={() => undefined}
					onSubmitTextAnnotation={() => undefined}
					onCancelPendingText={() => undefined}
					visible={true}
				/>
			</div>
		</div>
	);
};

const root = document.getElementById("root");
if (!root) throw new Error("overlay pixel fixture root not found");
createRoot(root).render(<OverlayPixelFixture />);
