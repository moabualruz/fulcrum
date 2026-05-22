import type { Command as CommandPrimitive } from "bits-ui";

export type CommandPaletteProps = CommandPrimitive.RootProps & {
	open?: boolean;
	title?: string;
};
