<script lang="ts" module>
	import type { Snippet } from "svelte";
	import { cn } from "../../utils.js";
	import { Sheet, SheetContent } from "../sheet/index.js";

	/**
	 * Where the drawer docks. `right` is the 420px desktop overlay (Cloudflare
	 * AI Assistant pattern); `bottom` is the mobile bottom-sheet branch.
	 */
	export type AcpDrawerSide = "right" | "bottom";

	export type AcpDrawerProps = {
		/** Controlled open state — drives `data-open` on the drawer surface. */
		open?: boolean;
		side?: AcpDrawerSide;
		/** Drawer header title (AI Assist). */
		title?: string;
		/** Optional Step-scope subtitle (`Step 3/8 · AUTH-43`). */
		scopeLabel?: string;
		/** Header trace slot — consumer passes a `<TraceChip badge />` (CONTEXT.md: TraceBadge in AcpDrawer header). */
		trace?: Snippet;
		/** Live thread body slot. */
		children?: Snippet;
		/** Composer / send-row slot. */
		composer?: Snippet;
		onOpenChange?: (open: boolean) => void;
		class?: string;
	};
</script>

<script lang="ts">
	let {
		open = $bindable(false),
		side = "right",
		title = "AI Assist",
		scopeLabel,
		trace,
		children,
		composer,
		onOpenChange,
		class: className,
	}: AcpDrawerProps = $props();

	function handleOpenChange(next: boolean) {
		open = next;
		onOpenChange?.(next);
	}
</script>

<Sheet bind:open onOpenChange={handleOpenChange}>
	<SheetContent
		{side}
		showCloseButton={true}
		data-slot="acp-drawer"
		data-open={open ? "true" : "false"}
		data-side={side}
		class={cn(
			"gap-0 border-border bg-surface-elevated p-0",
			side === "right"
				? "data-[side=right]:w-[92vw] data-[side=right]:sm:max-w-[420px]"
				: "data-[side=bottom]:max-h-[80vh]",
			className,
		)}
	>
		<header
			data-slot="acp-drawer-header"
			class="flex items-center gap-2 border-b border-border bg-surface-sunken px-4 py-3"
		>
			<span aria-hidden="true" class="text-accent">✨</span>
			<div class="flex flex-1 flex-col">
				<h2 data-slot="acp-drawer-title" class="text-sm font-semibold text-fg">{title}</h2>
				{#if scopeLabel}
					<p data-slot="acp-drawer-scope" class="font-mono text-xs text-fg-subtle">
						{scopeLabel}
					</p>
				{/if}
			</div>
			{#if trace}
				<span data-slot="acp-drawer-trace">{@render trace()}</span>
			{/if}
		</header>

		<div data-slot="acp-drawer-thread" class="flex-1 overflow-y-auto px-4 py-4 text-sm text-fg">
			{@render children?.()}
		</div>

		{#if composer}
			<footer
				data-slot="acp-drawer-composer"
				class="border-t border-border bg-surface-sunken px-4 py-3"
			>
				{@render composer()}
			</footer>
		{/if}
	</SheetContent>
</Sheet>
