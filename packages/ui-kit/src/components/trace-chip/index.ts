import Root from "./trace-chip.svelte";

export type { TraceChipProps } from "./trace-chip.exports.js";
export {
	Root,
	//
	Root as TraceChip,
	// DESIGN.md §4.10 alias: render with `badge` for the pixel-spec TraceBadge.
	Root as TraceBadge,
};
