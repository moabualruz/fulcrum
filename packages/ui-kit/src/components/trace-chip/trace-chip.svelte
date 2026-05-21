<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type TraceChipProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		/** Full trace identifier. The DESIGN.md §4.10 badge surfaces an 8-char hex prefix. */
		traceId: string;
		href?: string;
		/** Truncate to the §4.10 8-char hex prefix + ellipsis. `false` shows the full id. */
		short?: boolean;
		copyable?: boolean;
		/**
		 * Render the DESIGN.md §4.10 TraceBadge treatment: `trace:` prefix,
		 * 24px height, surface-sunken background, hover tooltip + right-click menu.
		 * `false` keeps the legacy compact ◷ pill.
		 */
		badge?: boolean;
		/** Tooltip + menu context (§4.10: full id + project + cycle + timestamp). */
		project?: string;
		cycle?: string;
		timestamp?: string;
		onCopy?: (traceId: string) => void;
		/** Right-click "Open in audit" target (§4.10). */
		onOpenAudit?: (traceId: string) => void;
		/** Right-click "Open in CLI": writes `fulcrum trace show <id>` to clipboard (§4.10). */
		onOpenCli?: (traceId: string) => void;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		traceId,
		href,
		short = true,
		copyable = true,
		badge = false,
		project,
		cycle,
		timestamp,
		onCopy,
		onOpenAudit,
		onOpenCli,
		class: className,
		...restProps
	}: TraceChipProps = $props();

	// §4.10: 8-char hex prefix of the trace id, then an ellipsis.
	const displayId = $derived(
		short && traceId.length > 8 ? `${traceId.slice(0, 8)}…` : traceId,
	);

	const tooltip = $derived(
		[
			traceId,
			project ? `project ${project}` : null,
			cycle ? `cycle ${cycle}` : null,
			timestamp ? `at ${timestamp}` : null,
		]
			.filter(Boolean)
			.join(" · "),
	);

	let menuOpen = $state(false);

	async function writeClipboard(text: string): Promise<void> {
		try {
			if (typeof navigator !== "undefined" && navigator.clipboard) {
				await navigator.clipboard.writeText(text);
			}
		} catch {
			// Clipboard unavailable; callers still receive the callback.
		}
	}

	async function copy() {
		await writeClipboard(traceId);
		onCopy?.(traceId);
	}

	function openMenu(event: MouseEvent) {
		if (!badge) return;
		event.preventDefault();
		menuOpen = true;
	}

	function closeMenu() {
		menuOpen = false;
	}

	function openAudit() {
		closeMenu();
		onOpenAudit?.(traceId);
	}

	async function openCli() {
		closeMenu();
		await writeClipboard(`fulcrum trace show ${traceId}`);
		onOpenCli?.(traceId);
	}
</script>

<svelte:window
	onclick={menuOpen ? closeMenu : undefined}
	onkeydown={menuOpen
		? (event) => {
				if (event.key === "Escape") closeMenu();
			}
		: undefined}
/>

<span
	bind:this={ref}
	data-slot="trace-chip"
	data-trace-id={traceId}
	data-variant={badge ? "badge" : "chip"}
	data-menu-open={badge ? (menuOpen ? "true" : "false") : undefined}
	class={cn(
		"relative inline-flex items-center gap-1 font-mono",
		badge
			? "h-6 rounded-sm border border-border bg-surface-sunken px-2 text-xs text-fg"
			: "rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground",
		className,
	)}
	title={badge ? tooltip : undefined}
	oncontextmenu={openMenu}
	{...restProps}
>
	{#if badge}
		<span aria-hidden="true" data-slot="trace-chip-prefix" class="text-[11px] text-fg-subtle"
			>trace:</span
		>
	{:else}
		<span aria-hidden="true" class="text-[10px]">◷</span>
	{/if}
	{#if href}
		<a
			href={href}
			data-slot="trace-chip-link"
			class="hover:text-accent focus-visible:underline focus-visible:outline-none"
		>
			{displayId}
		</a>
	{:else}
		<span data-slot="trace-chip-value">{displayId}</span>
	{/if}
	{#if copyable}
		<button
			type="button"
			aria-label="Copy trace id"
			data-slot="trace-chip-copy"
			class="ml-0.5 inline-flex size-4 items-center justify-center rounded-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onclick={copy}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 12 12"
				class="size-3"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="3" y="3" width="6" height="6" rx="1" />
				<path d="M5 1.5h4.5V6" />
			</svg>
		</button>
	{/if}

	{#if badge && menuOpen}
		<div
			role="menu"
			aria-label="Trace actions"
			data-slot="trace-chip-menu"
			class="absolute left-0 top-full z-50 mt-1 min-w-44 rounded-md border border-border bg-surface-elevated p-1 text-xs text-fg shadow-lg"
		>
			<button
				type="button"
				role="menuitem"
				data-slot="trace-chip-menu-audit"
				class="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={openAudit}
			>
				Open in audit
			</button>
			<button
				type="button"
				role="menuitem"
				data-slot="trace-chip-menu-cli"
				class="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={openCli}
			>
				Open in CLI
			</button>
		</div>
	{/if}
</span>
