// キーボードショートカット管理
import { useEffect, useRef } from "react";

type KeyboardShortcutActions = {
	nextFrame: () => void;
	prevFrame: () => void;
	setModeWwWc: () => void;
	setModeZoom: () => void;
	setModePan: () => void;
	fitSize: () => void;
	toggleInvert: () => void;
	resetImage: () => void;
	toggleCinePlay: () => void;
	setWwWcPreset: (index: number) => void;
	toggleFullscreen: () => void;
	printImage: () => void;
	setModeMeasureDistance: () => void;
	setModeMeasureAngle: () => void;
	clearMeasurements: () => void;
};

export const useKeyboardShortcuts = (
	actions: KeyboardShortcutActions,
	enabled: boolean,
) => {
	const actionsRef = useRef(actions);

	useEffect(() => {
		actionsRef.current = actions;
	}, [actions]);

	useEffect(() => {
		if (!enabled) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.isComposing || e.keyCode === 229) return;

			// input/textarea/contenteditable内では無効化
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			) {
				return;
			}

			const a = actionsRef.current;

			if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
				e.preventDefault();
				a.printImage();
				return;
			}
			if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

			switch (e.key) {
				case "ArrowUp":
				case "ArrowLeft":
					e.preventDefault();
					a.prevFrame();
					break;
				case "ArrowDown":
				case "ArrowRight":
					e.preventDefault();
					a.nextFrame();
					break;
				case "w":
				case "W":
					a.setModeWwWc();
					break;
				case "z":
				case "Z":
					a.setModeZoom();
					break;
				case "p":
				case "P":
					a.setModePan();
					break;
				case "f":
				case "F":
					a.fitSize();
					break;
				case "i":
				case "I":
					a.toggleInvert();
					break;
				case "r":
				case "R":
					a.resetImage();
					break;
				case " ":
					e.preventDefault();
					a.toggleCinePlay();
					break;
				case "d":
				case "D":
					a.setModeMeasureDistance();
					break;
				case "a":
				case "A":
					a.setModeMeasureAngle();
					break;
				case "Delete":
				case "Backspace":
					a.clearMeasurements();
					break;
				case "F11":
					e.preventDefault();
					a.toggleFullscreen();
					break;
				default:
					// 数字キー 1-7: WW/WCプリセット
					if (e.key >= "1" && e.key <= "7") {
						a.setWwWcPreset(Number.parseInt(e.key, 10) - 1);
					}
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [enabled]);
};
