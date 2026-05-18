import Root from "./select.svelte";
import Trigger from "./select-trigger.svelte";
import Content from "./select-content.svelte";
import Item from "./select-item.svelte";
import Value from "./select-value.svelte";

export type { SelectProps } from "./select.svelte";
export type { SelectTriggerProps } from "./select-trigger.svelte";
export type { SelectContentProps } from "./select-content.svelte";
export type { SelectItemProps } from "./select-item.svelte";
export type { SelectValueProps } from "./select-value.svelte";

export {
	Root,
	Trigger,
	Content,
	Item,
	Value,
	//
	Root as Select,
	Trigger as SelectTrigger,
	Content as SelectContent,
	Item as SelectItem,
	Value as SelectValue,
};
