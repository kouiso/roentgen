const SVG_ARIA_LABELS = ["注釈オーバーレイ", "計測オーバーレイ"];

const loadSvgAsImage = (svgElement: SVGSVGElement): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		// 画面内SVGは viewBox も width/height 属性も持たず、<img>化すると
		// intrinsic size 未定でラスタライズが既定サイズになる。そのまま canvas 全面に
		// 引き延ばすと、ペインCSSピクセル座標の内容が左上に1:1で置かれてしまう。
		// クローンへ viewBox=CSSサイズと width/height を付け直してからシリアライズし、
		// 表示座標系を保ったままキャンバスピクセルへ写せるようにする。
		const rect = svgElement.getBoundingClientRect();
		const clone = svgElement.cloneNode(true) as SVGSVGElement;
		clone.setAttribute("width", String(rect.width));
		clone.setAttribute("height", String(rect.height));
		clone.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
		const serializer = new XMLSerializer();
		const svgStr = serializer.serializeToString(clone);
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("SVG load failed"));
		// blob: だと CSP/img-src と canvas taint に引っかかるため data: URI で読む
		img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
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
