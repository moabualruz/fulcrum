<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type FieldErrorProps = WithElementRef<HTMLAttributes<HTMLParagraphElement>>;
</script>

<script lang="ts">
	let { ref = $bindable(null), class: className, children, ...restProps }: FieldErrorProps = $props();
</script>

<p
	bind:this={ref}
	data-slot="field-error"
	role="alert"
	aria-live="polite"
	class={cn("flex items-center gap-1 text-xs font-medium text-destructive", className)}
	{...restProps}
>
	<svg
		aria-hidden="true"
		viewBox="0 0 12 12"
		class="size-3"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<circle cx="6" cy="6" r="5" />
		<path d="M6 3.5v3M6 8.4h.01" />
	</svg>
	<span>{@render children?.()}</span>
</p>
