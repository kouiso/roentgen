// Cineモード — フレーム自動再生
import { useCallback, useEffect, useRef, useState } from "react";

type UseCineModeProps = {
	nextFrame: () => void;
	maxFrame: number;
	currentFrame: number;
};

export const useCineMode = ({
	nextFrame,
	maxFrame,
	currentFrame,
}: UseCineModeProps) => {
	const [isPlaying, setIsPlaying] = useState(false);
	const [fps, setFps] = useState(10);

	const nextFrameRef = useRef(nextFrame);
	const currentFrameRef = useRef(currentFrame);
	const maxFrameRef = useRef(maxFrame);

	useEffect(() => {
		nextFrameRef.current = nextFrame;
	}, [nextFrame]);

	useEffect(() => {
		currentFrameRef.current = currentFrame;
	}, [currentFrame]);

	useEffect(() => {
		maxFrameRef.current = maxFrame;
	}, [maxFrame]);

	// インターバル制御
	useEffect(() => {
		if (!isPlaying || maxFrame <= 0) return;

		const intervalMs = Math.round(1000 / fps);
		const id = setInterval(() => {
			if (currentFrameRef.current >= maxFrameRef.current) {
				setIsPlaying(false);
				return;
			}
			nextFrameRef.current();
		}, intervalMs);

		return () => clearInterval(id);
	}, [isPlaying, fps, maxFrame]);

	const togglePlay = useCallback(() => {
		setIsPlaying((prev) => {
			// 最終フレームから再生開始時は先頭に戻さない（nextFrameが自動停止する）
			return !prev;
		});
	}, []);

	const increaseFps = useCallback(() => {
		setFps((prev) => Math.min(30, prev + 5));
	}, []);

	const decreaseFps = useCallback(() => {
		setFps((prev) => Math.max(5, prev - 5));
	}, []);

	return {
		isPlaying,
		fps,
		togglePlay,
		setFps,
		increaseFps,
		decreaseFps,
	};
};
