// 計測ツール状態管理
import { useCallback, useState } from "react";
import type {
	AngleMeasurement,
	DistanceMeasurement,
	Measurement,
	MeasurementPoint,
} from "@/types/measurement";
import {
	calculateAngleDeg,
	calculateDistanceMm,
} from "@/utils/measurement-math";

type ActiveTool = "distance" | "angle" | null;

const createMeasurementId = (): string => {
	const cryptoApi = globalThis.crypto;
	if (!cryptoApi?.randomUUID) {
		throw new Error("crypto.randomUUID is required for measurement IDs");
	}
	return cryptoApi.randomUUID();
};

export const useMeasurement = (pixelSpacing: [number, number] | null) => {
	const [measurements, setMeasurements] = useState<Measurement[]>([]);
	const [activePoints, setActivePoints] = useState<MeasurementPoint[]>([]);
	const [activeTool, setActiveTool] = useState<ActiveTool>(null);

	const addPoint = useCallback(
		(point: MeasurementPoint) => {
			if (!activeTool) return;

			setActivePoints((prev) => {
				const next = [...prev, point];
				const requiredPoints = activeTool === "distance" ? 2 : 3;

				if (next.length >= requiredPoints) {
					// 計測完了
					const id = createMeasurementId();

					if (activeTool === "distance" && next.length >= 2) {
						const p1 = next[0] as MeasurementPoint;
						const p2 = next[1] as MeasurementPoint;
						const distanceMm = calculateDistanceMm(p1, p2, pixelSpacing);
						const measurement: DistanceMeasurement = {
							id,
							type: "distance",
							points: [p1, p2],
							distanceMm,
						};
						setMeasurements((ms) => [...ms, measurement]);
					} else if (activeTool === "angle" && next.length >= 3) {
						const p1 = next[0] as MeasurementPoint;
						const p2 = next[1] as MeasurementPoint;
						const p3 = next[2] as MeasurementPoint;
						const angleDeg = calculateAngleDeg(p1, p2, p3);
						const measurement: AngleMeasurement = {
							id,
							type: "angle",
							points: [p1, p2, p3],
							angleDeg,
						};
						setMeasurements((ms) => [...ms, measurement]);
					}

					return [];
				}

				return next;
			});
		},
		[activeTool, pixelSpacing],
	);

	const removeMeasurement = useCallback((id: string) => {
		setMeasurements((prev) => prev.filter((m) => m.id !== id));
	}, []);

	const clearAll = useCallback(() => {
		setMeasurements([]);
		setActivePoints([]);
	}, []);

	const startDistanceTool = useCallback(() => {
		setActiveTool("distance");
		setActivePoints([]);
	}, []);

	const startAngleTool = useCallback(() => {
		setActiveTool("angle");
		setActivePoints([]);
	}, []);

	const cancelTool = useCallback(() => {
		setActiveTool(null);
		setActivePoints([]);
	}, []);

	return {
		measurements,
		activePoints,
		activeTool,
		addPoint,
		removeMeasurement,
		clearAll,
		startDistanceTool,
		startAngleTool,
		cancelTool,
	};
};
