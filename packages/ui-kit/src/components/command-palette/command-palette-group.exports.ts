import type { Command as CommandPrimitive, WithoutChild } from "bits-ui";
import { cn } from "../../utils.js";

export type CommandPaletteGroupProps = WithoutChild<CommandPrimitive.GroupProps> & {
	/** Visible section heading text (IA-MAP §6 section labels). */
	heading?: string;
};
