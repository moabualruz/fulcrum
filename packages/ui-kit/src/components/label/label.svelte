<script lang="ts" module>
	import type { Label as LabelPrimitive, WithoutChildrenOrChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type LabelProps = WithoutChildrenOrChild<LabelPrimitive.RootProps> & {
		/** When true, render an asterisk indicating the field is required. */
		required?: boolean;
		/** When true, mark the label visually as optional (subtler treatment). */
		optional?: boolean;
		children?: import("svelte").Snippet;
	};
</script>

<script lang="ts">
	import { Label as LabelPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		required = false,
		optional = false,
		children,
		...restProps
	}: LabelProps = $props();
</script>

<LabelPrimitive.Root
	bind:ref
	data-slot="label"
	data-required={required ? "true" : undefined}
	data-optional={optional ? "true" : undefined}
	class={cn(
		"text-foreground inline-flex items-center gap-1 text-sm font-medium leading-none select-none",
		"peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
		"group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-60",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
	{#if required}
		<span class="text-destructive" aria-hidden="true">*</span>
		<span class="sr-only">required</span>
	{:else if optional}
		<span class="text-muted-foreground text-xs font-normal">(optional)</span>
	{/if}
</LabelPrimitive.Root>
