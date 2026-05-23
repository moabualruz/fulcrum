import Root from "./command-palette.svelte";
import Input from "./command-palette-input.svelte";
import List from "./command-palette-list.svelte";
import Item from "./command-palette-item.svelte";
import Empty from "./command-palette-empty.svelte";
import Group from "./command-palette-group.svelte";

export type { CommandPaletteProps } from "./command-palette.exports.js";
export type { CommandPaletteInputProps } from "./command-palette-input.exports.js";
export type { CommandPaletteListProps } from "./command-palette-list.exports.js";
export type { CommandPaletteItemProps } from "./command-palette-item.exports.js";
export type { CommandPaletteEmptyProps } from "./command-palette-empty.exports.js";
export type { CommandPaletteGroupProps } from "./command-palette-group.exports.js";

export {
	Root,
	Input,
	List,
	Item,
	Empty,
	Group,
	//
	Root as CommandPalette,
	Input as CommandPaletteInput,
	List as CommandPaletteList,
	Item as CommandPaletteItem,
	Empty as CommandPaletteEmpty,
	Group as CommandPaletteGroup,
};
