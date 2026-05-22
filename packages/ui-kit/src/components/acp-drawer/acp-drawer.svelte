<script lang="ts" module>
	import type { Snippet } from "svelte";
	import { cn } from "../../utils.js";
	import { Sheet, SheetContent } from "../sheet/index.js";

	/**
	 * Where the drawer docks. `right` is the 420px desktop overlay (Cloudflare
	 * AI Assistant pattern); `bottom` is the mobile bottom-sheet branch.
	 */
	export type AcpDrawerSide = "right" | "bottom";

	/**
	 * A single OD `.drawer-meta` strip cell (`ai-assist.html` lines 55-64,
	 * 118-125): label + value pair, e.g. `session run_8f29a4c`.
	 */
	export type AcpDrawerMetaItem = {
		/** Stable cell id: drives `data-meta-id` for design-e2e. */
		id: string;
		/** Plain label (`session`, `step`, `policy`, `cost`, `tokens`, `cache`, `elapsed`). */
		label: string;
		/** Bold value rendered after the label. */
		value: string;
	};

	/**
	 * One row of the agent-picker full panel (IA-MAP.md §5): a configured CLI
	 * agent with health + topology counts.
	 */
	export type AcpDrawerAgentRow = {
		/** Stable agent id: drives `data-agent-id`. */
		id: string;
		/** Agent display name. */
		name: string;
		/** Client kind metadata (`claude-code` · `codex` · `gemini-cli` · …). */
		client: string;
		/** Status text (`Ready`, `Paused`, `Offline`). */
		status: string;
		/** Status-dot tone: drives `data-status-tone`. */
		tone?: "ready" | "paused" | "offline";
		/** Round-trip latency string (`0.8s`, `n/a`). */
		latency: string;
		/** Connected MCP server count. */
		mcp: number;
		/** Installed plugin count. */
		plugins: number;
		/** Routing-ring badge label (`executor`, `validator`, `planner`) or null. */
		ring?: string | null;
	};

	export type AcpDrawerProps = {
		/** Controlled open state: drives `data-open` on the drawer surface. */
		open?: boolean;
		side?: AcpDrawerSide;
		/** Drawer header title (AI Assist). */
		title?: string;
		/** Optional Step-scope subtitle (`Step 3/8 · AUTH-43`). */
		scopeLabel?: string;
		/** Selected agent label shown on the picker control. */
		agentLabel?: string;
		/** Agent registry rows; when non-empty the picker opens the full panel. */
		agents?: AcpDrawerAgentRow[];
		/** OD `.drawer-meta` strip cells (session · step · policy · cost · tokens · cache · elapsed). */
		meta?: AcpDrawerMetaItem[];
		/** Header trace slot: consumer passes a `<TraceChip badge />` (CONTEXT.md: TraceBadge in AcpDrawer header). */
		trace?: Snippet;
		/** Live thread body slot. */
		children?: Snippet;
		/** Composer / send-row slot. */
		composer?: Snippet;
		onOpenChange?: (open: boolean) => void;
		/** Agent-picker selection callback (agent id). */
		onAgentSelect?: (agentId: string) => void;
		/** Expand action: widens the drawer for protocol detail (`ai-assist.html`). */
		onExpand?: () => void;
		/** Save-thread → reusable prompt template snapshot (`ai-assist.html` line 89). */
		onSaveThread?: () => void;
		class?: string;
	};
</script>

<script lang="ts">
	let {
		open = $bindable(false),
		side = "right",
		title = "AI Assist",
		scopeLabel,
		agentLabel = "claude-code",
		agents = [],
		meta = [],
		trace,
		children,
		composer,
		onOpenChange,
		onAgentSelect,
		onExpand,
		onSaveThread,
		class: className,
	}: AcpDrawerProps = $props();

	/** Agent-picker full panel disclosure state. */
	let pickerOpen = $state(false);

	function handleOpenChange(next: boolean) {
		open = next;
		if (!next) pickerOpen = false;
		onOpenChange?.(next);
	}

	function togglePicker() {
		pickerOpen = !pickerOpen;
	}

	function selectAgent(agentId: string) {
		onAgentSelect?.(agentId);
		pickerOpen = false;
	}
</script>

<Sheet bind:open onOpenChange={handleOpenChange}>
	<SheetContent
		{side}
		showCloseButton={true}
		aria-label={title}
		data-slot="acp-drawer"
		data-open={open ? "true" : "false"}
		data-side={side}
		data-picker-open={pickerOpen ? "true" : "false"}
		style={side === "right"
			? "width:420px;max-width:92vw"
			: "width:92vw;max-width:none;height:auto;max-height:80vh"}
		class={cn(
			// `side` encodes the device: `right` is the 420px desktop overlay,
			// `bottom` is the 92vw mobile bottom sheet (DESIGN.md §3.1). The
			// exact width is set via inline `style` above so it is deterministic
			//: SheetContent's base `w-3/4` / `max-w-sm` would otherwise cap it.
			"gap-0 border-border bg-surface-elevated p-0",
			className,
		)}
	>
		<header
			data-slot="acp-drawer-header"
			class="grid gap-2 border-b border-border bg-surface-sunken px-4 py-3 pr-12"
		>
			<!-- Row 1: AI Assist icon + title / Step-scope subtitle + expand. -->
			<div class="flex items-center gap-2">
				<span aria-hidden="true" class="shrink-0 text-accent">⊞</span>
				<div class="flex min-w-0 flex-1 flex-col">
					<h2 data-slot="acp-drawer-title" class="truncate text-sm font-semibold text-fg">
						{title}
					</h2>
					{#if scopeLabel}
						<p
							data-slot="acp-drawer-scope"
							class="truncate font-mono text-xs text-fg-subtle"
						>
							{scopeLabel}
						</p>
					{/if}
				</div>
				{#if onExpand}
					<button
						type="button"
						data-slot="acp-drawer-expand"
						aria-label="Expand AI Assist"
						class="grid size-7 shrink-0 place-items-center rounded-sm text-fg-subtle hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onclick={() => onExpand?.()}
					>
						<span aria-hidden="true">⛶</span>
					</button>
				{/if}
				<!-- Close: the SheetContent close button stays the canonical close affordance. -->
			</div>
			<!-- Row 2: agent picker + trace badge. -->
			<div class="flex flex-wrap items-center gap-2">
				<!-- Agent picker: opens a full panel listing every configured CLI agent (IA-MAP.md §5). -->
				<button
					type="button"
					data-slot="acp-drawer-agent-picker"
					aria-haspopup="dialog"
					aria-expanded={pickerOpen}
					aria-label="Agent picker"
					class="flex h-7 min-w-0 items-center gap-1 rounded-sm border border-border bg-surface px-2 font-mono text-xs text-fg hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onclick={togglePicker}
				>
					<span class="truncate">{agentLabel}</span>
					<span aria-hidden="true" class="shrink-0 text-fg-subtle">▾</span>
				</button>
				{#if trace}
					<span data-slot="acp-drawer-trace" class="min-w-0">{@render trace()}</span>
				{/if}
			</div>
		</header>

		{#if pickerOpen}
			<!-- Agent-picker full panel (IA-MAP.md §5 / COPY.md §319): every configured CLI agent. -->
			<section
				data-slot="acp-drawer-agent-panel"
				aria-label="Agent registry"
				class="flex max-h-72 flex-col gap-2 overflow-y-auto border-b border-border bg-surface px-4 py-3"
			>
				{#each agents as agent (agent.id)}
					<button
						type="button"
						data-slot="acp-drawer-agent-row"
						data-agent-id={agent.id}
						data-status-tone={agent.tone ?? "ready"}
						class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-sm border border-border bg-surface-elevated px-3 py-2 text-left hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onclick={() => selectAgent(agent.id)}
					>
						<span
							data-slot="acp-drawer-agent-status-dot"
							aria-hidden="true"
							class={cn(
								"block size-2 rounded-full",
								(agent.tone ?? "ready") === "ready" && "bg-success",
								agent.tone === "paused" && "bg-warning",
								agent.tone === "offline" && "bg-destructive",
							)}
						></span>
						<span class="flex min-w-0 flex-col">
							<span class="truncate text-xs font-semibold text-fg">{agent.name}</span>
							<span class="truncate font-mono text-[10px] text-fg-subtle">
								<span data-slot="acp-drawer-agent-client">{agent.client}</span>
								· {agent.status}
								· <span data-slot="acp-drawer-agent-latency">{agent.latency}</span>
							</span>
						</span>
						<span class="flex items-center gap-1.5 font-mono text-[10px] text-fg-subtle">
							<span data-slot="acp-drawer-agent-mcp">{agent.mcp} mcp</span>
							<span data-slot="acp-drawer-agent-plugins">{agent.plugins} plugins</span>
							{#if agent.ring}
								<span
									data-slot="acp-drawer-agent-ring"
									class="rounded-sm border border-accent px-1 text-accent"
									>{agent.ring}</span
								>
							{/if}
						</span>
					</button>
				{/each}
				<a
					data-slot="acp-drawer-agent-manage"
					href="/settings#agents"
					class="rounded-sm px-1 py-0.5 text-xs font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Manage agents, MCP &amp; plugins in Settings →
				</a>
			</section>
		{/if}

		{#if meta.length}
			<!-- OD `.drawer-meta` strip: session · step · policy · cost · tokens · cache · elapsed. -->
			<div
				data-slot="acp-drawer-meta"
				class="flex flex-wrap gap-x-3 gap-y-1 border-b border-border bg-surface-sunken px-4 py-2 font-mono text-[10px] text-fg-muted"
			>
				{#each meta as item (item.id)}
					<span
						data-slot="acp-drawer-meta-item"
						data-meta-id={item.id}
						class="inline-flex items-center gap-1"
					>
						{item.label}
						<b class="font-semibold text-fg">{item.value}</b>
					</span>
				{/each}
			</div>
		{/if}

		<div data-slot="acp-drawer-thread" class="flex-1 overflow-y-auto px-4 py-4 text-sm text-fg">
			{@render children?.()}
		</div>

		{#if composer || onSaveThread}
			<footer
				data-slot="acp-drawer-composer"
				class="grid gap-2 border-t border-border bg-surface-sunken px-4 py-3"
			>
				{@render composer?.()}
				{#if onSaveThread}
					<button
						type="button"
						data-slot="acp-drawer-save-thread"
						class="justify-self-start rounded-sm border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onclick={() => onSaveThread?.()}
					>
						💾 Save thread to prompt template
					</button>
				{/if}
			</footer>
		{/if}
	</SheetContent>
</Sheet>
