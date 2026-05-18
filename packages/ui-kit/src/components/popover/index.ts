import Root from "./popover.svelte";
import Trigger from "./popover-trigger.svelte";
import Content from "./popover-content.svelte";

export type { PopoverProps } from "./popover.svelte";
export type { PopoverTriggerProps } from "./popover-trigger.svelte";
export type { PopoverContentProps } from "./popover-content.svelte";

export {
	Root,
	Trigger,
	Content,
	//
	Root as Popover,
	Trigger as PopoverTrigger,
	Content as PopoverContent,
};
