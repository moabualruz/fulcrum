import Root from "./popover.svelte";
import Trigger from "./popover-trigger.svelte";
import Content from "./popover-content.svelte";

export type { PopoverProps } from "./popover.exports.js";
export type { PopoverTriggerProps } from "./popover-trigger.exports.js";
export type { PopoverContentProps } from "./popover-content.exports.js";

export {
	Root,
	Trigger,
	Content,
	//
	Root as Popover,
	Trigger as PopoverTrigger,
	Content as PopoverContent,
};
