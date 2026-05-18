<script lang="ts" module>
	import type { Command as CommandPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type CommandPaletteInputProps = WithoutChild<CommandPrimitive.InputProps>;
</script>

<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CommandPaletteInputProps = $props();
</script>

<div class="flex items-center gap-2 border-b border-border px-3 py-2">
	<svg
		aria-hidden="true"
		viewBox="0 0 16 16"
		class="size-4 text-muted-foreground"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<circle cx="7" cy="7" r="4" />
		<path d="m13 13-3-3" />
	</svg>
	<CommandPrimitive.Input
		bind:ref
		data-slot="command-palette-input"
		class={cn(
			"h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground",
			className,
		)}
		{...restProps}
	/>
</div>
