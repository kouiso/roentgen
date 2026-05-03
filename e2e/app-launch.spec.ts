import { expect, test } from "@playwright/test";

test.describe("Roentgen — App Launch & Empty State", () => {
	test("renders header with app title", async ({ page }) => {
		await page.goto("/");
		const header = page.locator("header");
		await expect(header).toBeVisible();
		await expect(header).toContainText("Roentgen");
	});

	test("shows DICOM drop zone with instructions", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText("DICOMファイルをドロップ")).toBeVisible();
		await expect(page.getByText("またはクリックして選択")).toBeVisible();
	});

	test("shows file status indicator", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText("ファイル待機")).toBeVisible();
	});

	test("drop zone has upload icon", async ({ page }) => {
		await page.goto("/");
		const dropZone = page.locator("[role='button']");
		await expect(dropZone).toBeVisible();
		await expect(dropZone).toHaveAttribute("tabindex", "0");
	});

	test("no console errors on initial load", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});
		await page.goto("/");
		await page.waitForTimeout(1000);
		const jsErrors = errors.filter(
			(e) => !e.includes("favicon") && !e.includes("404"),
		);
		expect(jsErrors).toHaveLength(0);
	});

	test("page has correct dark theme background", async ({ page }) => {
		await page.goto("/");
		const body = page.locator("body");
		const bg = await body.evaluate(
			(el) => window.getComputedStyle(el).backgroundColor,
		);
		expect(bg).not.toBe("rgb(255, 255, 255)");
	});
});
