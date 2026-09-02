import { inflateSync } from "node:zlib";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

type RgbaImage = {
	width: number;
	height: number;
	data: Uint8Array;
};
type PixelMatcher = (red: number, green: number, blue: number) => boolean;

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

const readUint32 = (buffer: Buffer, offset: number) =>
	buffer.readUInt32BE(offset);

const paeth = (a: number, b: number, c: number) => {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	if (pa <= pb && pa <= pc) return a;
	if (pb <= pc) return b;
	return c;
};

const decodePng = (buffer: Buffer): RgbaImage => {
	for (const [index, value] of pngSignature.entries()) {
		if (buffer[index] !== value) throw new Error("invalid PNG signature");
	}

	let width = 0;
	let height = 0;
	let colorType = 0;
	let bitDepth = 0;
	const idatChunks: Buffer[] = [];
	let offset = 8;

	while (offset < buffer.length) {
		const length = readUint32(buffer, offset);
		const type = buffer.toString("ascii", offset + 4, offset + 8);
		const dataStart = offset + 8;
		const dataEnd = dataStart + length;
		const chunk = buffer.subarray(dataStart, dataEnd);

		if (type === "IHDR") {
			width = readUint32(chunk, 0);
			height = readUint32(chunk, 4);
			bitDepth = chunk[8] ?? 0;
			colorType = chunk[9] ?? 0;
		} else if (type === "IDAT") {
			idatChunks.push(chunk);
		} else if (type === "IEND") {
			break;
		}

		offset = dataEnd + 4;
	}

	if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
		throw new Error(
			`unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`,
		);
	}

	const channels = colorType === 6 ? 4 : 3;
	const inflated = inflateSync(Buffer.concat(idatChunks));
	const scanlineLength = width * channels;
	const raw = new Uint8Array(height * scanlineLength);
	let sourceOffset = 0;

	for (let y = 0; y < height; y += 1) {
		const filter = inflated[sourceOffset] ?? 0;
		sourceOffset += 1;
		const rowOffset = y * scanlineLength;
		const previousRowOffset = rowOffset - scanlineLength;

		for (let x = 0; x < scanlineLength; x += 1) {
			const current = inflated[sourceOffset + x] ?? 0;
			const left = x >= channels ? (raw[rowOffset + x - channels] ?? 0) : 0;
			const up = y > 0 ? (raw[previousRowOffset + x] ?? 0) : 0;
			const upLeft =
				y > 0 && x >= channels
					? (raw[previousRowOffset + x - channels] ?? 0)
					: 0;
			const predictor = (() => {
				switch (filter) {
					case 0:
						return 0;
					case 1:
						return left;
					case 2:
						return up;
					case 3:
						return Math.floor((left + up) / 2);
					case 4:
						return paeth(left, up, upLeft);
					default:
						throw new Error(`unsupported PNG filter: ${filter}`);
				}
			})();
			raw[rowOffset + x] = (current + predictor) & 0xff;
		}

		sourceOffset += scanlineLength;
	}

	const rgba = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const source = y * scanlineLength + x * channels;
			const target = (y * width + x) * 4;
			rgba[target] = raw[source] ?? 0;
			rgba[target + 1] = raw[source + 1] ?? 0;
			rgba[target + 2] = raw[source + 2] ?? 0;
			rgba[target + 3] = channels === 4 ? (raw[source + 3] ?? 255) : 255;
		}
	}

	return { width, height, data: rgba };
};

const hasPixelNear = (
	image: RgbaImage,
	x: number,
	y: number,
	matcher: PixelMatcher,
	radius = 4,
) => {
	const minX = Math.max(0, Math.round(x) - radius);
	const maxX = Math.min(image.width - 1, Math.round(x) + radius);
	const minY = Math.max(0, Math.round(y) - radius);
	const maxY = Math.min(image.height - 1, Math.round(y) + radius);

	for (let sampleY = minY; sampleY <= maxY; sampleY += 1) {
		for (let sampleX = minX; sampleX <= maxX; sampleX += 1) {
			const index = (sampleY * image.width + sampleX) * 4;
			if (
				matcher(
					image.data[index] ?? 0,
					image.data[index + 1] ?? 0,
					image.data[index + 2] ?? 0,
				)
			) {
				return true;
			}
		}
	}

	return false;
};

const isRed = (red: number, green: number, blue: number) =>
	red > 220 && green < 70 && blue < 70;

const isGold = (red: number, green: number, blue: number) =>
	red > 220 && green > 170 && blue < 80;

const overlayApiReady = () =>
	Boolean(
		(
			window as {
				__roentgenOverlayPixel?: unknown;
			}
		).__roentgenOverlayPixel,
	);

const waitForOverlayFixture = async (page: Page): Promise<Locator> => {
	await page.goto("/e2e/overlay-pixel.html");
	const fixture = page.getByTestId("overlay-fixture");
	await expect(fixture).toBeVisible();
	await page.waitForFunction(overlayApiReady);
	await expect
		.poll(async () =>
			fixture
				.locator("svg[aria-label='計測オーバーレイ'] line")
				.first()
				.evaluate((line) => Number(line.getAttribute("x1"))),
		)
		.toBe(100);
	await page.waitForTimeout(100);
	return fixture;
};

const callOverlayApi = async (
	page: Page,
	payload:
		| { method: "setSize"; args: [number, number] }
		| {
				method: "setViewport";
				args: [{ zoom: number; center: { x: number; y: number } }];
		  },
) => {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			await page.waitForFunction(overlayApiReady);
			await page.evaluate(({ method, args }) => {
				const api = (
					window as {
						__roentgenOverlayPixel?: {
							setSize: (width: number, height: number) => void;
							setViewport: (state: {
								zoom: number;
								center: { x: number; y: number };
							}) => void;
						};
					}
				).__roentgenOverlayPixel;
				if (!api) throw new Error("overlay pixel fixture API is not ready");
				if (method === "setSize") {
					api.setSize(...args);
				} else {
					api.setViewport(...args);
				}
			}, payload);
			return;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (attempt < 2 && message.includes("Execution context was destroyed")) {
				await page.waitForLoadState("domcontentloaded").catch(() => undefined);
				await page.waitForTimeout(100);
				continue;
			}
			throw error;
		}
	}
};

test.describe("Roentgen overlay rendered-pixel reprojection", () => {
	test.use({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });

	test("keeps annotation and measurement pixels anchored after resize", async ({
		page,
	}) => {
		const fixture = await waitForOverlayFixture(page);

		const initial = decodePng(await fixture.screenshot());
		expect(hasPixelNear(initial, 100, 50, isRed)).toBe(true);
		expect(hasPixelNear(initial, 150, 75, isGold)).toBe(true);

		await callOverlayApi(page, { method: "setSize", args: [800, 400] });
		await expect(fixture).toHaveCSS("width", "800px");
		await expect
			.poll(async () =>
				fixture
					.locator("svg[aria-label='計測オーバーレイ'] line")
					.first()
					.evaluate((line) => Number(line.getAttribute("x1"))),
			)
			.toBe(160);

		const resized = decodePng(await fixture.screenshot());
		expect(hasPixelNear(resized, 160, 80, isRed)).toBe(true);
		expect(hasPixelNear(resized, 240, 120, isGold)).toBe(true);
		expect(hasPixelNear(resized, 100, 50, isRed)).toBe(false);
	});

	test("keeps overlay pixels anchored after viewport pan and zoom", async ({
		page,
	}) => {
		const fixture = await waitForOverlayFixture(page);

		await callOverlayApi(page, {
			method: "setViewport",
			args: [
				{
					zoom: 2,
					center: { x: 0.25, y: 0.125 },
				},
			],
		});

		await expect
			.poll(async () =>
				fixture
					.locator("svg[aria-label='計測オーバーレイ'] line")
					.first()
					.evaluate((line) => ({
						x1: Number(line.getAttribute("x1")),
						y1: Number(line.getAttribute("y1")),
					})),
			)
			.toEqual({ x1: 200, y1: 100 });

		const panned = decodePng(await fixture.screenshot());
		expect(hasPixelNear(panned, 200, 100, isRed)).toBe(true);
		expect(hasPixelNear(panned, 300, 150, isGold)).toBe(true);
		expect(hasPixelNear(panned, 100, 50, isRed)).toBe(false);
	});
});
