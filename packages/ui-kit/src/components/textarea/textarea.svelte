<script lang="ts" module>
	import type { HTMLTextareaAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type TextareaProps = WithElementRef<HTMLTextareaAttributes> & {
		autoResize?: boolean;
		minRows?: number;
		maxRows?: number;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		value = $bindable(""),
		class: className,
		autoResize = false,
		minRows = 3,
		maxRows = 12,
		rows,
		...restProps
	}: TextareaProps = $props();

	function resize(node: HTMLTextAreaElement): void {
		if (!autoResize) return;
		node.style.height = "auto";
		const lineHeight = parseFloat(getComputedStyle(node).lineHeight || "20");
		const min = lineHeight * minRows;
		const max = lineHeight * maxRows;
		node.style.height = `${Math.min(max, Math.max(min, node.scrollHeight))}px`;
	}

	$effect(() => {
		if (autoResize && ref) resize(ref);
		// Track value for resize trigger.
		void value;
	});
</script>

<textarea
	bind:this={ref}
	bind:value
	data-slot="textarea"
	data-auto-resize={autoResize ? "true" : undefined}
	rows={rows ?? minRows}
	class={cn(
		"flex min-h-7 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow]",
		"placeholder:text-muted-foreground",
		"focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-2",
		"aria-invalid:border-destructive aria-invalid:ring-destructive/30 aria-invalid:ring-2",
		"disabled:cursor-not-allowed disabled:opacity-50",
		autoResize && "resize-none",
		className,
	)}
	oninput={() => {
		if (autoResize && ref) resize(ref);
	}}
	{...restProps}
></textarea>
