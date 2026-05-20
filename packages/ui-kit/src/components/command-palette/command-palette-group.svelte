<script lang="ts" module>
	import type { Command as CommandPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type CommandPaletteGroupProps = WithoutChild<CommandPrimitive.GroupProps> & {
		/** Visible section heading text (IA-MAP §6 section labels). */
		heading?: string;
	};
</script>

<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		heading,
		value,
		children,
		...restProps
	}: CommandPaletteGroupProps = $props();
</script>

<!--
	Grouped section of the CommandPalette — a labelled run of CommandPaletteItem
	rows. Wraps the bits-ui `Command.Group` + `Command.GroupHeading` so a
	consumer renders an IA-MAP §6 palette section (Recent, Workflow stage nav,
	Step actions, …) without hand-rolling a heading. The heading uses
	`Command.GroupHeading` so bits-ui keeps it `aria-labelledby`-linked to the
	group's rows.
-->
<CommandPrimitive.Group
	bind:ref
	{value}
	data-slot="command-palette-group"
	class={cn("py-1", className)}
	{...restProps}
>
	{#if heading}
		<CommandPrimitive.GroupHeading
			data-slot="command-palette-group-heading"
			class="px-2 py-1 text-xs font-medium text-muted-foreground"
		>
			{heading}
		</CommandPrimitive.GroupHeading>
	{/if}
	<CommandPrimitive.GroupItems data-slot="command-palette-group-items">
		{@render children?.()}
	</CommandPrimitive.GroupItems>
</CommandPrimitive.Group>
