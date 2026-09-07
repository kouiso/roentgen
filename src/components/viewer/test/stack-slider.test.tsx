// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StackSlider } from "../stack-slider";

const makeProps = () => ({
	currentFrame: 2,
	maxFrame: 5,
	onFrameChange: vi.fn(),
	onNext: vi.fn(),
	onPrev: vi.fn(),
});

const getButton = (name: string) =>
	screen.getByRole("button", { name }) as HTMLButtonElement;

describe("StackSlider", () => {
	it("exposes clear frame selection text to assistive technology", () => {
		const props = makeProps();
		render(<StackSlider {...props} />);

		const slider = screen.getByRole("slider", {
			name: "スタックフレーム選択",
		});

		expect(slider.getAttribute("aria-valuetext")).toBe("3枚目 / 全6枚");
		expect(slider.getAttribute("min")).toBe("0");
		expect(slider.getAttribute("max")).toBe("5");
		expect((slider as HTMLInputElement).value).toBe("2");

		fireEvent.change(slider, { target: { value: "4" } });

		expect(props.onFrameChange).toHaveBeenCalledWith(4);
	});

	it("uses native disabled semantics for previous and next bounds", () => {
		const { rerender } = render(
			<StackSlider {...makeProps()} currentFrame={0} maxFrame={5} />,
		);

		expect(getButton("前のフレーム").disabled).toBe(true);
		expect(getButton("次のフレーム").disabled).toBe(false);

		rerender(<StackSlider {...makeProps()} currentFrame={5} maxFrame={5} />);

		expect(getButton("前のフレーム").disabled).toBe(false);
		expect(getButton("次のフレーム").disabled).toBe(true);
	});
});
