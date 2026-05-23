import Root from "./select.svelte";
import Trigger from "./select-trigger.svelte";
import Content from "./select-content.svelte";
import Item from "./select-item.svelte";
import Value from "./select-value.svelte";

export type { SelectProps } from "./select.exports.js";
export type { SelectTriggerProps } from "./select-trigger.exports.js";
export type { SelectContentProps } from "./select-content.exports.js";
export type { SelectItemProps } from "./select-item.exports.js";
export type { SelectValueProps } from "./select-value.exports.js";

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
