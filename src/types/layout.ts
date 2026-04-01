// レイアウト型定義
export const LAYOUT_TYPE = {
	ONE_BY_ONE: "1x1",
	TWO_BY_ONE: "2x1",
	ONE_BY_TWO: "1x2",
	TWO_BY_TWO: "2x2",
} as const;

export type LayoutType = (typeof LAYOUT_TYPE)[keyof typeof LAYOUT_TYPE];

export const LAYOUT_PANE_COUNT: Record<LayoutType, number> = {
	"1x1": 1,
	"2x1": 2,
	"1x2": 2,
	"2x2": 4,
};

// CSS Grid テンプレート定義
export const LAYOUT_GRID_TEMPLATE: Record<
	LayoutType,
	{ cols: string; rows: string }
> = {
	"1x1": { cols: "1fr", rows: "1fr" },
	"2x1": { cols: "1fr 1fr", rows: "1fr" },
	"1x2": { cols: "1fr", rows: "1fr 1fr" },
	"2x2": { cols: "1fr 1fr", rows: "1fr 1fr" },
};
