import Root from "./context-menu.svelte";
import Trigger from "./context-menu-trigger.svelte";
import Content from "./context-menu-content.svelte";
import Item from "./context-menu-item.svelte";

export type { ContextMenuProps } from "./context-menu.svelte";
export type { ContextMenuTriggerProps } from "./context-menu-trigger.svelte";
export type { ContextMenuContentProps } from "./context-menu-content.svelte";
export type { ContextMenuItemProps } from "./context-menu-item.svelte";

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
