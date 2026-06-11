// CSS Grid レイアウトマネージャ — 複数ペインを管理
import type { ReactNode } from "react";
import { LAYOUT_GRID_TEMPLATE, type LayoutType } from "@/types/layout";

type ViewerLayoutProps = {
	layout: LayoutType;
	children: ReactNode[];
};

export const ViewerLayout = ({ layout, children }: ViewerLayoutProps) => {
	const { cols, rows } = LAYOUT_GRID_TEMPLATE[layout];

	return (
		<div
			className="grid min-h-0 flex-1 gap-px bg-line"
			style={{
				gridTemplateColumns: cols,
				gridTemplateRows: rows,
			}}
		>
			{children}
		</div>
	);
};
