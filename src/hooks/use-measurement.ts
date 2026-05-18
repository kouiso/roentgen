// 計測ツール状態管理
import { useCallback, useState } from "react";
import type {
	AngleMeasurement,
	DistanceMeasurement,
	Measurement,
	MeasurementPoint,
} from "@/types/measurement";
import {
	DEFAULT_ANGLE_COLOR,
	DEFAULT_DISTANCE_COLOR,
} from "@/utils/annotation-storage";
import { calculateAngleDeg, calculateDistance } from "@/utils/measurement-math";

type ActiveTool = "distance" | "angle" | null;

const createMeasurementId = (): string => {
	const cryptoApi = globalThis.crypto;
	if (!cryptoApi?.randomUUID) {
		throw new Error("crypto.randomUUID is required for measurement IDs");
	}
	return cryptoApi.randomUUID();
};

const createMeasurementMetadata = (
	type: "distance" | "angle",
	sopInstanceUid: string | null,
) => ({
	color: type === "distance" ? DEFAULT_DISTANCE_COLOR : DEFAULT_ANGLE_COLOR,
	...(sopInstanceUid ? { sopInstanceUid } : {}),
});

export const useMeasurement = (
	pixelSpacing: [number, number] | null,
	currentSopInstanceUid: string | null = null,
) => {
	const [measurements, setMeasurements] = useState<Measurement[]>([]);
	const [activePoints, setActivePoints] = useState<MeasurementPoint[]>([]);
	const [activeTool, setActiveTool] = useState<ActiveTool>(null);

	const addPoint = useCallback(
		(point: MeasurementPoint) => {
			if (!activeTool) return;
			const id = createMeasurementId();

			setActivePoints((prev) => {
				const next = [...prev, point];
				const requiredPoints = activeTool === "distance" ? 2 : 3;

				if (next.length >= requiredPoints) {
					// 計測完了
					if (activeTool === "distance" && next.length >= 2) {
						const p1 = next[0] as MeasurementPoint;
						const p2 = next[1] as MeasurementPoint;
						const distance = calculateDistance(p1, p2, pixelSpacing);
						const measurement: DistanceMeasurement = {
							id,
							type: "distance",
							...createMeasurementMetadata("distance", currentSopInstanceUid),
							points: [p1, p2],
							distanceMm: distance.value,
							distanceUnit: distance.unit,
							calibrated: distance.calibrated,
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
							...createMeasurementMetadata("angle", currentSopInstanceUid),
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
		[activeTool, pixelSpacing, currentSopInstanceUid],
	);

	const removeMeasurement = useCallback((id: string) => {
		setMeasurements((prev) => prev.filter((m) => m.id !== id));
	}, []);

	const clearAll = useCallback(() => {
		setMeasurements([]);
		setActivePoints([]);
		setActiveTool(null);
	}, []);

	const replaceMeasurements = useCallback((items: Measurement[]) => {
		setMeasurements(items);
		setActivePoints([]);
		setActiveTool(null);
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
		replaceMeasurements,
		startDistanceTool,
		startAngleTool,
		cancelTool,
	};
};
