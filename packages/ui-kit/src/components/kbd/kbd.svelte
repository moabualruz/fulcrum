<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type KbdProps = WithElementRef<HTMLAttributes<HTMLElement>>;
</script>

<script lang="ts">
	let { ref = $bindable(null), class: className, children, ...restProps }: KbdProps = $props();
</script>

<kbd
	bind:this={ref}
	data-slot="kbd"
	class={cn(
		"inline-flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-xs,2px)] border border-border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground shadow-xs",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</kbd>
