import type { HTMLAttributes } from "svelte/elements";
import type { Snippet } from "svelte";
import { cn, type WithElementRef } from "../../utils.js";

/** Footer density (DESIGN.md §3.1: compact 38 / base 44 / comfortable 50). */
export type StatusFooterMode = "compact" | "base" | "comfortable";

const MODE_HEIGHT: Record<StatusFooterMode, string> = {
	compact: "h-[38px]",
	base: "h-11",
	comfortable: "h-[50px]",
};

/** A single left-cluster segment (mode pill · profile · branch · run · agent · MCP). */
export type StatusFooterSegment = {
	id: string;
	label: string;
	/** Optional small leading glyph / dot. */
	glyph?: string;
	/** Render the segment label as a pill (used for the input-mode pill). */
	pill?: boolean;
};

export type StatusFooterProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	/** Footer density (DESIGN.md §3.1). */
	mode?: StatusFooterMode;
	/** Left cluster segments. */
	segments?: StatusFooterSegment[];
	/** Visible label for the right-most AI Assist trigger segment. */
	aiAssistLabel?: string;
	/** Keyboard hint shown in the AI Assist segment (DESIGN.md §3.1: ⌘/). */
	aiAssistShortcut?: string;
	/** Right-cluster slot (trace badge · clock · help · palette) placed before AI Assist. */
	rightCluster?: Snippet;
	onAiAssist?: () => void;
};
