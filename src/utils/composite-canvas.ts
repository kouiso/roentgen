/**
 * Composites the OSD canvas with SVG annotation/measurement overlays
 * into a single PNG data URL for print and screenshot export.
 *
 * DOM traversal: canvas → OSD id-div → black-bg-div → relative-wrapper
 * Queries aria-label SVG siblings within the relative wrapper.
 */

const SVG_ARIA_LABELS = ["注釈オーバーレイ", "計測オーバーレイ"];

const loadSvgAsImage = (svgElement: SVGSVGElement): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const serializer = new XMLSerializer();
		const svgStr = serializer.serializeToString(svgElement);
		const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("SVG load failed"));
		};
		img.src = url;
	});

/**
 * Returns a composite PNG data URL of the canvas + all visible SVG overlays.
 * Falls back to canvas-only data URL if overlay lookup or drawing fails.
 */
export const compositeCanvasWithOverlays = async (
	canvas: HTMLCanvasElement,
): Promise<string> => {
	// Navigate to the relative wrapper that contains OSD + SVG siblings
	// canvas → OSD id-div → black-bg-div → relative-wrapper
	const relativeWrapper = canvas.parentElement?.parentElement?.parentElement;
	if (!relativeWrapper) return canvas.toDataURL("image/png");

	const svgElements = SVG_ARIA_LABELS.flatMap((label) => {
		const el = relativeWrapper.querySelector<SVGSVGElement>(
			`svg[aria-label="${label}"]`,
		);
		return el ? [el] : [];
	});

	if (svgElements.length === 0) return canvas.toDataURL("image/png");

	const offscreen = document.createElement("canvas");
	offscreen.width = canvas.width;
	offscreen.height = canvas.height;
	const ctx = offscreen.getContext("2d");
	if (!ctx) return canvas.toDataURL("image/png");

	ctx.drawImage(canvas, 0, 0);

	for (const svg of svgElements) {
		try {
			const img = await loadSvgAsImage(svg);
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		} catch {
			// Non-fatal: skip this SVG layer
		}
	}

	return offscreen.toDataURL("image/png");
};
