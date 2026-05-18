import Root from "./combobox.svelte";
import Input from "./combobox-input.svelte";
import Content from "./combobox-content.svelte";
import Item from "./combobox-item.svelte";

export type { ComboboxProps } from "./combobox.svelte";
export type { ComboboxInputProps } from "./combobox-input.svelte";
export type { ComboboxContentProps } from "./combobox-content.svelte";
export type { ComboboxItemProps } from "./combobox-item.svelte";

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
