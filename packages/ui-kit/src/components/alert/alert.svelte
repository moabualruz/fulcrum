<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { type VariantProps, tv } from "tailwind-variants";
	import { cn, type WithElementRef } from "../../utils.js";

	export type AlertTone = "info" | "success" | "warning" | "error" | "tip";

	const ALERT_GLYPH: Record<AlertTone, string> = {
		info: "i",
		success: "✓",
		warning: "!",
		error: "✕",
		tip: "?",
	};

	const ALERT_ROLE: Record<AlertTone, "status" | "alert"> = {
		info: "status",
		success: "status",
		warning: "alert",
		error: "alert",
		tip: "status",
	};

	export const alertVariants = tv({
		base: "relative grid grid-cols-[1.5rem_1fr] gap-3 rounded-md border px-4 py-3",
		variants: {
			tone: {
				info: "border-info/40 bg-info/10 text-foreground",
				success: "border-success/40 bg-success/10 text-foreground",
				warning: "border-warning/50 bg-warning/15 text-foreground",
				error: "border-destructive/40 bg-destructive/10 text-foreground",
				tip: "border-accent/40 bg-accent/10 text-foreground",
			},
		},
		defaultVariants: { tone: "info" },
	});

	export type AlertProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		tone?: AlertTone;
		title?: string;
		hideIcon?: boolean;
	};

	export const ALERT_TONE_GLYPH = ALERT_GLYPH;
	export const ALERT_TONE_ROLE = ALERT_ROLE;
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		tone = "info",
		title,
		hideIcon = false,
		class: className,
		children,
		...restProps
	}: AlertProps = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert"
	data-tone={tone}
	role={ALERT_ROLE[tone]}
	aria-label={title ? undefined : `${tone} alert`}
	class={cn(alertVariants({ tone }), className)}
	{...restProps}
>
	{#if hideIcon}
		<span></span>
	{:else}
		<span
			aria-hidden="true"
			data-slot="alert-icon"
			class={cn(
				"mt-0.5 inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold text-fg-inverse",
				tone === "info" && "bg-info",
				tone === "success" && "bg-success",
				tone === "warning" && "bg-warning text-warning-foreground",
				tone === "error" && "bg-destructive",
				tone === "tip" && "bg-accent",
			)}
		>
			{ALERT_GLYPH[tone]}
		</span>
	{/if}
	<div class="grid gap-1">
		{#if title}
			<p data-slot="alert-title" class="text-sm font-semibold leading-snug">{title}</p>
		{/if}
		<div data-slot="alert-body" class="text-sm leading-relaxed text-muted-foreground">
			{@render children?.()}
		</div>
	</div>
</div>
