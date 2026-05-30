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

const compositeWithRelativeWrapper = async (
	canvas: HTMLCanvasElement,
	relativeWrapper: Element,
): Promise<string> => {
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

/**
 * Returns a composite PNG data URL of the canvas + all visible SVG overlays.
 * osdContainer is the #osd-pane-N element (in-DOM OSD container).
 * DOM path: osdContainer → div.absolute.inset-0 → div.relative (has SVG siblings).
 * Falls back to canvas-only data URL if overlay lookup or drawing fails.
 */
export const compositeCanvasById = async (
	canvas: HTMLCanvasElement,
	osdContainer: HTMLElement,
): Promise<string> => {
	const relativeWrapper = osdContainer.parentElement?.parentElement;
	if (!relativeWrapper) return canvas.toDataURL("image/png");
	return compositeWithRelativeWrapper(canvas, relativeWrapper);
};
