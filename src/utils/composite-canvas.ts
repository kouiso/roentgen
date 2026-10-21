import type { ImageGeometry } from "@/utils/image-geometry";
import {
	imageToContainerCoord,
	type OSDViewport,
} from "@/utils/measurement-math";

const SVG_ARIA_LABELS = ["注釈オーバーレイ", "計測オーバーレイ"];

// オーバーレイの画面座標を画像座標へ写像するための表示状態。
// 呼び出し側のアクティブペインからそのまま渡す（オーバーレイの
// 再投影と同じ viewport / geometry を使うのが正しさの要）
export type CompositeView = {
	viewport: OSDViewport | null;
	imageWidth: number;
	imageHeight: number;
	geometry?: ImageGeometry | null;
};

const loadSvgAsImage = (svgElement: SVGSVGElement): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		// 画面内SVGは viewBox も width/height 属性も持たず、<img>化すると
		// intrinsic size 未定でラスタライズが既定サイズになる。そのまま canvas 全面に
		// 引き延ばすと、ペインCSSピクセル座標の内容が左上に1:1で置かれてしまう。
		// クローンへ viewBox=CSSサイズと width/height を付け直してからシリアライズし、
		// 表示座標系を保ったままキャンバスピクセルへ写せるようにする。
		const rect = svgElement.getBoundingClientRect();
		const clone = svgElement.cloneNode(true) as SVGSVGElement;
		// 削除ボタン等の foreignObject は、切り出したSVGでは Tailwind クラスが
		// 効かず「×」として焼き込まれるため除去する
		for (const fo of Array.from(clone.querySelectorAll("foreignObject"))) {
			fo.remove();
		}
		// ルートの inline style (width/height:100%) が width/height 属性を上書きして
		// 固有サイズが未定に戻るため、属性で指定した寸法を有効にする
		clone.removeAttribute("style");
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

// 画像4隅をオーバーレイと同じ imageToContainerCoord でコンテナ座標へ写し、
// ページ座標での表示矩形（軸平行の外接矩形）にする。
// ズーム・パンで画像がペインからはみ出していても正しい窓が取れる
const imageScreenRect = (
	container: HTMLElement,
	view: CompositeView,
): { left: number; top: number; right: number; bottom: number } | null => {
	if (!view.viewport || view.imageWidth <= 0 || view.imageHeight <= 0) {
		return null;
	}
	const containerRect = container.getBoundingClientRect();
	const corners = [
		{ x: 0, y: 0 },
		{ x: view.imageWidth, y: 0 },
		{ x: 0, y: view.imageHeight },
		{ x: view.imageWidth, y: view.imageHeight },
	].map((p) =>
		imageToContainerCoord(
			p,
			view.imageWidth,
			view.imageHeight,
			containerRect,
			view.viewport,
			view.geometry,
		),
	);
	if (corners.some((c) => c === null)) return null;
	const xs = corners.map((c) => (c?.x ?? 0) + containerRect.left);
	const ys = corners.map((c) => (c?.y ?? 0) + containerRect.top);
	return {
		left: Math.min(...xs),
		top: Math.min(...ys),
		right: Math.max(...xs),
		bottom: Math.max(...ys),
	};
};

const compositeWithRelativeWrapper = async (
	canvas: HTMLCanvasElement,
	container: HTMLElement,
	relativeWrapper: Element,
	view: CompositeView,
): Promise<string> => {
	const svgElements = SVG_ARIA_LABELS.flatMap((label) => {
		const el = relativeWrapper.querySelector<SVGSVGElement>(
			`svg[aria-label="${label}"]`,
		);
		return el ? [el] : [];
	});

	if (svgElements.length === 0) {
		return canvas.toDataURL("image/png");
	}

	const offscreen = document.createElement("canvas");
	offscreen.width = canvas.width;
	offscreen.height = canvas.height;
	const ctx = offscreen.getContext("2d");
	if (!ctx) return canvas.toDataURL("image/png");

	ctx.drawImage(canvas, 0, 0);

	// 画像の画面上の表示矩形。取得できない場合だけ従来の全面引き延ばしに退く
	const imageRect = imageScreenRect(container, view);
	const imageRectW = imageRect ? imageRect.right - imageRect.left : 0;
	const imageRectH = imageRect ? imageRect.bottom - imageRect.top : 0;

	for (const svg of svgElements) {
		try {
			const img = await loadSvgAsImage(svg);
			if (!imageRect || imageRectW <= 0 || imageRectH <= 0) {
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				continue;
			}
			const svgRect = svg.getBoundingClientRect();
			// SVGは画面座標、書き出し先は画像座標。画像が画面から
			// はみ出している部分のオーバーレイは画像の外なので描かない
			const left = Math.max(svgRect.left, imageRect.left);
			const top = Math.max(svgRect.top, imageRect.top);
			const right = Math.min(svgRect.right, imageRect.right);
			const bottom = Math.min(svgRect.bottom, imageRect.bottom);
			if (right <= left || bottom <= top) continue;
			const scaleX = canvas.width / imageRectW;
			const scaleY = canvas.height / imageRectH;
			ctx.drawImage(
				img,
				left - svgRect.left,
				top - svgRect.top,
				right - left,
				bottom - top,
				(left - imageRect.left) * scaleX,
				(top - imageRect.top) * scaleY,
				(right - left) * scaleX,
				(bottom - top) * scaleY,
			);
		} catch (error) {
			// オーバーレイ1層の失敗でPNG保存全体を落とさないが、
			// CSP/シリアライズ系の障害を表面化させるため警告は出す
			console.warn("[composite-canvas] overlay SVG layer skipped:", error);
		}
	}

	return offscreen.toDataURL("image/png");
};

/**
 * Returns a composite PNG data URL of the canvas + all visible SVG overlays.
 * osdContainer is the #osd-pane-N element (in-DOM OSD container).
 * DOM path: osdContainer → div.absolute.inset-0 → div.relative (has SVG siblings).
 * view はペインの表示状態（オーバーレイ描画と同じ viewport / geometry）。
 * Falls back to canvas-only data URL if overlay lookup or drawing fails.
 */
export const compositeCanvasById = async (
	canvas: HTMLCanvasElement,
	osdContainer: HTMLElement,
	view: CompositeView,
): Promise<string> => {
	const relativeWrapper = osdContainer.parentElement?.parentElement;
	if (!relativeWrapper) {
		console.warn("[composite-canvas] relativeWrapper not found");
		return canvas.toDataURL("image/png");
	}
	return compositeWithRelativeWrapper(
		canvas,
		osdContainer,
		relativeWrapper,
		view,
	);
};
