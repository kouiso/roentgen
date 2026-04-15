import { describe, expect, it } from "vitest";
import { OVERLAY_ITEMS } from "./overlay-items";

function findItemOrFail(id: string) {
	const item = OVERLAY_ITEMS.find((i) => i.id === id);
	if (!item) throw new Error(`Item ${id} not found`);
	return item;
}

describe("OVERLAY_ITEMS", () => {
	it("is a non-empty array", () => {
		expect(OVERLAY_ITEMS.length).toBeGreaterThan(0);
	});

	it("every item has required fields", () => {
		for (const item of OVERLAY_ITEMS) {
			expect(item.id).toBeTruthy();
			expect(item.tag).toBeTruthy();
			expect(item.label).toBeTruthy();
			expect(["topLeft", "topRight", "bottomLeft", "bottomRight"]).toContain(
				item.position,
			);
		}
	});

	it("has no duplicate ids", () => {
		const ids = OVERLAY_ITEMS.map((i) => i.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("contains items for all four positions", () => {
		const positions = new Set(OVERLAY_ITEMS.map((i) => i.position));
		expect(positions.has("topLeft")).toBe(true);
		expect(positions.has("topRight")).toBe(true);
		expect(positions.has("bottomLeft")).toBe(true);
		expect(positions.has("bottomRight")).toBe(true);
	});

	it("patient info items are placed in topLeft", () => {
		const patientItems = OVERLAY_ITEMS.filter(
			(i) =>
				i.id === "patientName" ||
				i.id === "patientId" ||
				i.id === "patientBirthDate" ||
				i.id === "patientSex" ||
				i.id === "patientAge",
		);
		for (const item of patientItems) {
			expect(item.position).toBe("topLeft");
		}
	});

	it("study info items are placed in topRight", () => {
		const studyItems = OVERLAY_ITEMS.filter(
			(i) =>
				i.id === "studyDate" ||
				i.id === "studyTime" ||
				i.id === "modality" ||
				i.id === "institutionName",
		);
		for (const item of studyItems) {
			expect(item.position).toBe("topRight");
		}
	});

	it("format function for dates works correctly", () => {
		const dateItem = findItemOrFail("patientBirthDate");
		expect(dateItem.format).toBeDefined();
		if (!dateItem.format) return;
		expect(dateItem.format("20240315")).toBe("2024/03/15");
	});

	it("format function for dates returns raw value for non-8-char input", () => {
		const dateItem = findItemOrFail("patientBirthDate");
		if (!dateItem.format) return;
		expect(dateItem.format("short")).toBe("short");
	});

	it("format function for time works correctly", () => {
		const timeItem = findItemOrFail("studyTime");
		expect(timeItem.format).toBeDefined();
		if (!timeItem.format) return;
		expect(timeItem.format("143022.123")).toBe("14:30:22");
	});

	it("format function for time returns raw value for short input", () => {
		const timeItem = findItemOrFail("studyTime");
		if (!timeItem.format) return;
		expect(timeItem.format("14")).toBe("14");
	});

	it("computed tags use _ prefix", () => {
		const computed = OVERLAY_ITEMS.filter((i) => i.tag.startsWith("_"));
		expect(computed.length).toBeGreaterThan(0);
		for (const item of computed) {
			expect(item.tag.startsWith("_")).toBe(true);
		}
	});

	it("imageSize computed tag exists in bottomRight", () => {
		const item = findItemOrFail("imageSize");
		expect(item.tag).toBe("_imageSize");
		expect(item.position).toBe("bottomRight");
	});

	it("bitsInfo computed tag exists in bottomRight", () => {
		const item = findItemOrFail("bitsInfo");
		expect(item.tag).toBe("_bitsInfo");
		expect(item.position).toBe("bottomRight");
	});
});
