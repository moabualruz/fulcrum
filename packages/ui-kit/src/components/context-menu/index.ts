import Root from "./context-menu.svelte";
import Trigger from "./context-menu-trigger.svelte";
import Content from "./context-menu-content.svelte";
import Item from "./context-menu-item.svelte";

export type { ContextMenuProps } from "./context-menu.exports.js";
export type { ContextMenuTriggerProps } from "./context-menu-trigger.exports.js";
export type { ContextMenuContentProps } from "./context-menu-content.exports.js";
export type { ContextMenuItemProps } from "./context-menu-item.exports.js";

export {
	Root,
	Trigger,
	Content,
	Item,
	//
	Root as ContextMenu,
	Trigger as ContextMenuTrigger,
	Content as ContextMenuContent,
	Item as ContextMenuItem,
};
