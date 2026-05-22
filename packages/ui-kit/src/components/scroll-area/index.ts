import Root from "./scroll-area.svelte";
import Scrollbar from "./scroll-area-scrollbar.svelte";

export type { ScrollAreaProps, ScrollAreaOrientation } from "./scroll-area.exports.js";
export type { ScrollAreaScrollbarProps } from "./scroll-area-scrollbar.exports.js";

export {
	Root,
	Scrollbar,
	//
	Root as ScrollArea,
	Scrollbar as ScrollAreaScrollbar,
};
