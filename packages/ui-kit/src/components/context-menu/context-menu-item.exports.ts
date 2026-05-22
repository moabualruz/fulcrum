import type { ContextMenu as ContextMenuPrimitive, WithoutChild } from "bits-ui";
import { cn } from "../../utils.js";

export type ContextMenuItemProps = WithoutChild<ContextMenuPrimitive.ItemProps> & {
	tone?: "neutral" | "destructive";
};
