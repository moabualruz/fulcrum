import Root from "./combobox.svelte";
import Input from "./combobox-input.svelte";
import Content from "./combobox-content.svelte";
import Item from "./combobox-item.svelte";

export type { ComboboxProps } from "./combobox.exports.js";
export type { ComboboxInputProps } from "./combobox-input.exports.js";
export type { ComboboxContentProps } from "./combobox-content.exports.js";
export type { ComboboxItemProps } from "./combobox-item.exports.js";

export {
	Root,
	Input,
	Content,
	Item,
	//
	Root as Combobox,
	Input as ComboboxInput,
	Content as ComboboxContent,
	Item as ComboboxItem,
};
