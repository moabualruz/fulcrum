<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type FormFieldProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		label?: string;
		description?: string;
		error?: string;
		required?: boolean;
		optional?: boolean;
		htmlFor?: string;
		layout?: "stacked" | "inline";
	};
</script>

<script lang="ts">
	import Label from "../label/label.svelte";
	import FieldError from "../field-error/field-error.svelte";

	let {
		ref = $bindable(null),
		label,
		description,
		error,
		required = false,
		optional = false,
		htmlFor,
		layout = "stacked",
		class: className,
		children,
		...restProps
	}: FormFieldProps = $props();

	const descriptionId = $derived(htmlFor ? `${htmlFor}-description` : undefined);
	const errorId = $derived(htmlFor ? `${htmlFor}-error` : undefined);
</script>

<div
	bind:this={ref}
	data-slot="form-field"
	data-layout={layout}
	data-invalid={error ? "true" : undefined}
	class={cn(
		"grid gap-1.5",
		layout === "inline" && "grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-1",
		className,
	)}
	{...restProps}
>
	{#if label}
		<Label for={htmlFor} {required} {optional}>{label}</Label>
	{/if}
	<div class={cn(layout === "inline" && label ? "row-start-1 col-start-2 row-span-2" : "")}>
		{@render children?.()}
	</div>
	{#if description && !error}
		<p
			id={descriptionId}
			data-slot="form-field-description"
			class={cn("text-xs text-muted-foreground", layout === "inline" && "col-start-2")}
		>
			{description}
		</p>
	{/if}
	{#if error}
		<FieldError id={errorId}>{error}</FieldError>
	{/if}
</div>
