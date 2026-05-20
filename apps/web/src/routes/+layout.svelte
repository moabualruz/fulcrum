<script lang="ts">
	import type { Snippet } from "svelte";
	import { onMount } from "svelte";
	import { ModeWatcher, toggleMode } from "mode-watcher";
	import { Toaster } from "svelte-sonner";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import favicon from "$lib/assets/favicon.svg";
	import { toastFromForm } from "$lib/feedback/use-form-toast";
	import AppSidebar from "$lib/components/app/AppSidebar.svelte";
	import AppTopbar from "$lib/components/app/AppTopbar.svelte";
	import TraceFooter from "$lib/components/app/TraceFooter.svelte";
	import CommandPalette from "$lib/components/command-palette/CommandPalette.svelte";
	import { makeKeydownHandler } from "$lib/components/command-palette/command-palette-handlers";
	import { buildProjectCommandItems } from "$lib/components/command-palette/project-command-items";
	import ShortcutHelpOverlay from "$lib/components/ShortcutHelpOverlay.svelte";
	import {
		AcpDrawer,
		Chip,
		Kbd,
		Sheet,
		SheetContent,
		SheetTrigger,
		TraceBadge,
		TraceChip,
		type AcpDrawerAgentRow,
		type AcpDrawerMetaItem,
		type AcpDrawerSide,
	} from "@fulcrum/ui-kit";
	import { buttonVariants } from "@fulcrum/ui-kit";
	import {
		MOBILE_QUERY,
		browserDriver,
		isMobileViewport,
	} from "$lib/util/media-query";
	import { cn } from "$lib/utils.js";

	import type { InferenceStatus } from "$lib/components/app/AppTopbar.svelte";

	import "../app.css";
	import type { LayoutData } from "./$types";

	interface Props {
		data: LayoutData;
		children?: Snippet;
	}

	let { data, children }: Props = $props();

	let mobile = $state(isMobileViewport(browserDriver()));
	let sheetOpen = $state(false);
	let paletteOpen = $state(false);
	let shortcutHelpOpen = $state(false);
	let inferenceStatus = $state<InferenceStatus>("unknown");

	/*
	 * Global AI Assist drawer (DESIGN.md §3.1, IA-MAP.md §5, ai-assist.html).
	 * `+layout.svelte` owns the ONE shell-level AcpDrawer instance: every entry
	 * point — `⌘/`, the StatusFooter `✨ AI Assist` segment, and (later) per-Step
	 * `⊞ AI Assist` mode buttons — toggles this single drawer. Closing it pauses
	 * the visual presence only; `aiSessionActive` keeps the session alive so the
	 * transcript/composer state survives the move (cross-states.md §ai-assist.html).
	 */
	let aiAssistOpen = $state(false);
	let aiSessionActive = $state(true);
	let aiSelectedAgent = $state("claude-code");
	let aiSavedNotice = $state("");
	const aiDrawerSide = $derived<AcpDrawerSide>(mobile ? "bottom" : "right");

	/*
	 * The AI Assist drawer auto-scopes to the current Step. Static OD-backed
	 * fixture data (ai-assist.html: planning session run_8f29a4c, Step 3/8) — a
	 * real Step-scope feed lands with prd-cli-ai-assist-step-scope's web sibling.
	 */
	const aiTraceId = "4f3a1c9e2b7d8a6c5e1f0d3b9a7c2e4f";
	const aiScopeLabel = "Step 3 / 8 · Persist issuance row per kid";
	const aiMeta: AcpDrawerMetaItem[] = [
		{ id: "session", label: "session", value: "run_8f29a4c" },
		{ id: "step", label: "step", value: "3 / 8" },
		{ id: "policy", label: "policy", value: "ask-on-write" },
		{ id: "cost", label: "cost", value: "$0.43" },
		{ id: "tokens", label: "tokens", value: "12,480 / 4,312" },
		{ id: "cache", label: "cache", value: "76%" },
		{ id: "elapsed", label: "elapsed", value: "3m 42s" },
	];
	const aiAgents: AcpDrawerAgentRow[] = [
		{ id: "claude-code", name: "Claude Code Opus", client: "claude-code", status: "Ready", tone: "ready", latency: "0.8s", mcp: 12, plugins: 4, ring: "executor" },
		{ id: "codex", name: "Codex High", client: "codex", status: "Ready", tone: "ready", latency: "0.6s", mcp: 9, plugins: 3, ring: "validator" },
		{ id: "gemini-cli", name: "Gemini Pro", client: "gemini-cli", status: "Paused", tone: "paused", latency: "n/a", mcp: 5, plugins: 2, ring: "planner" },
		{ id: "opencode", name: "OpenCode Local", client: "opencode", status: "Ready", tone: "ready", latency: "1.1s", mcp: 7, plugins: 1, ring: null },
		{ id: "pi-cli", name: "Pi Review", client: "pi-cli", status: "Offline", tone: "offline", latency: "n/a", mcp: 0, plugins: 0, ring: null },
	];
	const aiTranscript = [
		{ speaker: "User", text: "Use the selected document and attachment to start planning the authentication rewrite." },
		{ speaker: "AI Assist", text: "I found 4 source refs, 2 task links, and 1 blocker. Planning can start with trace 4f3a1c9e." },
		{ speaker: "Tool", text: "read.document doc_auth_rewrite · read.attachment att_sec_review · list.related task_auth_42" },
	];
	const aiAgentLabel = $derived(
		aiAgents.find((a) => a.id === aiSelectedAgent)?.name ?? aiSelectedAgent,
	);

	function openAiAssist(): void {
		aiAssistOpen = true;
	}
	function toggleAiAssist(): void {
		aiAssistOpen = !aiAssistOpen;
	}
	function onAiAssistOpenChange(next: boolean): void {
		aiAssistOpen = next;
		// Closing pauses visual presence only — the session is not aborted.
	}
	function selectAiAgent(agentId: string): void {
		aiSelectedAgent = agentId;
	}
	function saveAiThread(): void {
		aiSavedNotice = "Thread saved as prompt template";
	}

	const commandKeydownHandler = makeKeydownHandler(() => paletteOpen, (next) => (paletteOpen = next));

	// Poll inference sidecar health every 30s (client-side only)
	$effect(() => {
		if (typeof window === "undefined" || typeof fetch !== "function") return;
		let cancelled = false;
		async function poll() {
			try {
				const res = await fetch("/api/inference/health");
				if (!res.ok) { inferenceStatus = "unreachable"; return; }
				const data = await res.json();
				inferenceStatus = data.status ?? "unreachable";
			} catch {
				inferenceStatus = "unreachable";
			}
		}
		void poll();
		const id = setInterval(() => { if (!cancelled) void poll(); }, 30_000);
		return () => { cancelled = true; clearInterval(id); };
	});

	const paletteItems = $derived(buildProjectCommandItems({ activeProjectId: data.activeProjectId }));

	$effect(() => {
		if (typeof window === "undefined" || typeof window.matchMedia !== "function")
			return;
		const mql = window.matchMedia(MOBILE_QUERY);
		mobile = mql.matches;
		const onChange = (e: MediaQueryListEvent) => {
			mobile = e.matches;
		};
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	});

	$effect(() => {
		toastFromForm(page.form as Parameters<typeof toastFromForm>[0]);
	});

	$effect(() => {
		if (page.url.searchParams.get("e2e_palette") === "1") paletteOpen = true;
		if (page.url.searchParams.get("e2e_help") === "1") shortcutHelpOpen = true;
	});

	$effect(() => {
		if (typeof window === "undefined") return;
		document.body.dataset.fulcrumHydrated = "true";
		return () => {
			delete document.body.dataset.fulcrumHydrated;
		};
	});

	onMount(() => {
		window.addEventListener("keydown", onGlobalKeydown);
		window.addEventListener("keyup", onGlobalKeyup);
		const openHelp = () => (shortcutHelpOpen = true);
		window.addEventListener("fulcrum:open-shortcut-help", openHelp);
		// The StatusFooter `✨ AI Assist` segment + every per-Step `⊞ AI Assist`
		// mode button dispatch this event; the one shell drawer listens here.
		window.addEventListener("fulcrum:open-ai-assist", openAiAssist);
		return () => {
			window.removeEventListener("keydown", onGlobalKeydown);
			window.removeEventListener("keyup", onGlobalKeyup);
			window.removeEventListener("fulcrum:open-shortcut-help", openHelp);
			window.removeEventListener("fulcrum:open-ai-assist", openAiAssist);
		};
	});

	function onGlobalKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const tag = typeof target?.tagName === "string" ? target.tagName.toLowerCase() : "";
		// ⌘/ (or Ctrl+/) toggles the AI Assist drawer from any route. The meta/ctrl
		// modifier makes it a deliberate chord, so it fires inside text fields too
		// without stealing a literal "/" keystroke (IA-MAP.md §5 "⌘/ from anywhere").
		if (event.key === "/" && (event.metaKey || event.ctrlKey) && !event.altKey) {
			event.preventDefault();
			toggleAiAssist();
			return;
		}
		if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey) {
			if (tag !== "input" && tag !== "textarea" && target?.isContentEditable !== true) {
				event.preventDefault();
				shortcutHelpOpen = true;
				return;
			}
		}
		if (typeof event.key === "string" && event.key.toLowerCase() === "k" && tag !== "input" && tag !== "textarea" && target?.isContentEditable !== true) {
			event.preventDefault();
			paletteOpen = !paletteOpen;
			return;
		}
		commandKeydownHandler(event);
	}

	function onGlobalKeyup(event: KeyboardEvent) {
		if (event.key === "Meta" || event.key === "Control") {
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName.toLowerCase();
			if (tag !== "input" && tag !== "textarea" && target?.isContentEditable !== true) {
				paletteOpen = true;
			}
		}
	}
</script>

<svelte:head>
	<title>Fulcrum</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<!--
	Skip link (DESIGN.md §4.14): rendered immediately after <body> as the first
	focusable element so the first Tab press reaches it; off-screen until focused,
	then revealed with a visible focus-visible ring using the border-focus token.
-->
<a
	href="#main-content"
	id="skip-to-content"
	data-slot="skip-link"
	class={cn(
		"sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-2 focus-visible:z-[9999]",
		"focus-visible:rounded focus-visible:border focus-visible:border-accent focus-visible:bg-surface-elevated",
		"focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-accent",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
	)}
>Skip to main content</a>

<ModeWatcher />

<!-- Toast region: aria-live so screen readers announce toasts without overwhelming them -->
<div
	data-toast-region
	aria-live="polite"
	aria-atomic="false"
	aria-label="Notifications"
>
	<Toaster richColors closeButton position="top-right" />
</div>

<CommandPalette
	items={paletteItems}
	open={paletteOpen}
	onOpenChange={(next) => (paletteOpen = next)}
	onSelect={(item) => {
		if (item.href) void goto(item.href);
	}}
/>

<ShortcutHelpOverlay open={shortcutHelpOpen} onClose={() => (shortcutHelpOpen = false)} />

<!--
	Global AI Assist drawer (DESIGN.md §3.1, IA-MAP.md §5, ai-assist.html).
	The single shell-level AcpDrawer instance — composed from the @fulcrum/ui-kit
	AcpDrawer primitive (AGENTS.md ui-kit rule: never a route-local overlay). Open
	from `⌘/`, the StatusFooter segment, or per-Step `⊞ AI Assist`. 420px desktop
	right overlay / 92vw mobile bottom sheet via the `aiDrawerSide` switch.
-->
<AcpDrawer
	open={aiAssistOpen}
	side={aiDrawerSide}
	title="AI Assist"
	scopeLabel={aiScopeLabel}
	agentLabel={aiAgentLabel}
	agents={aiAgents}
	meta={aiMeta}
	onOpenChange={onAiAssistOpenChange}
	onAgentSelect={selectAiAgent}
	onExpand={() => goto("/ai-assist")}
	onSaveThread={saveAiThread}
	class="ai-assist-shell-drawer"
>
	{#snippet trace()}
		<TraceBadge badge data-ai-assist-trace traceId={aiTraceId} project="fulcrum" />
	{/snippet}
	<div class="grid gap-3" data-ai-assist-thread>
		<p class="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
			Suggestions for this screen
		</p>
		{#each ["Summarize what's on this screen", "What should I do next?", "Explain the controls and shortcuts", "Find similar past work"] as suggestion}
			<button
				type="button"
				data-ai-assist-suggestion
				class="rounded-sm border border-border bg-surface px-3 py-2 text-left text-xs text-fg hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>{suggestion}</button
			>
		{/each}
		{#each aiTranscript as message}
			<article class="rounded-sm border border-border bg-surface p-3" data-ai-assist-message>
				<div class="mb-1 flex items-center justify-between gap-2">
					<h3 class="text-xs font-semibold text-fg">{message.speaker}</h3>
					<TraceChip badge traceId={aiTraceId} project="fulcrum" />
				</div>
				<p class="text-xs leading-5 text-fg-subtle">{message.text}</p>
			</article>
		{/each}
		{#if aiSavedNotice}
			<p class="text-xs text-fg-subtle" data-ai-assist-saved>{aiSavedNotice}</p>
		{/if}
	</div>
	{#snippet composer()}
		<div class="grid gap-2" data-ai-assist-composer>
			<textarea
				class="min-h-16 resize-y rounded-sm border border-border bg-surface p-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label="AI Assist composer"
				placeholder="type or paste; @ to mention scope…"
			></textarea>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-1.5">
					<Chip tone="neutral">@ scope</Chip>
					<Chip tone="neutral">📎 attach</Chip>
					<Kbd>⌘↵</Kbd>
				</div>
				<button
					type="button"
					data-ai-assist-send
					class="rounded-sm bg-accent px-3 py-1.5 text-xs font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>▶ Send</button
				>
			</div>
		</div>
	{/snippet}
</AcpDrawer>

<div class={cn("flex min-h-screen bg-background text-foreground")}>
	{#if mobile}
		<Sheet bind:open={sheetOpen}>
			<!-- Mobile shell region for the StageRail; width matches the 220px expanded rail. -->
			<SheetContent
				side="left"
				class="w-[220px] p-0"
				aria-label="Navigation menu"
				data-shell-region="stage-rail"
			>
				<AppSidebar activeProjectId={data.activeProjectId} />
			</SheetContent>
			<div class={cn("flex min-w-0 flex-1 flex-col")}>
				<div class={cn("flex items-center pt-[var(--fulcrum-safe-area-top)]")}>
					<SheetTrigger
						data-mobile-sheet-trigger
						aria-label="Open navigation menu"
						aria-expanded={sheetOpen}
						class={cn(
							buttonVariants({ variant: "ghost", size: "icon" }),
							"ml-2",
						)}
					>
						<span aria-hidden="true">☰</span>
					</SheetTrigger>
					<div class="flex-1">
						<AppTopbar
							pathname={page.url.pathname}
							activeProjectId={data.activeProjectId}
							onThemeToggle={toggleMode}
						/>
					</div>
				</div>
				<main id="main-content" tabindex="-1" class={cn("flex-1 px-6 pt-6 pb-[calc(1.5rem+var(--fulcrum-gesture-zone-bottom))]")}>
					{@render children?.()}
				</main>
				<!--
					Mobile (DESIGN.md §3.2): the 44px StatusFooter is hidden; the trace
					id stays reachable through a swipe-down quick panel — a disclosure
					carrying the shared DESIGN.md §4.10 TraceBadge.
				-->
				<details
					data-mobile-trace-panel
					class={cn(
						"border-t border-border bg-surface-elevated text-xs text-fg-subtle",
						"pb-[var(--fulcrum-gesture-zone-bottom)]",
					)}
				>
					<summary
						data-mobile-trace-summary
						aria-label="Show trace id"
						class={cn(
							"flex cursor-pointer list-none items-center justify-center gap-1.5 px-4 py-2",
							"font-mono text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					>
						<span aria-hidden="true">⌃</span>
						<span>Trace</span>
					</summary>
					<div class="flex items-center gap-2 px-4 pb-3">
						<TraceBadge
							badge
							data-mobile-trace-id
							traceId={data?.traceId ?? data?.requestId ?? "trace-init"}
							project="fulcrum"
						/>
					</div>
				</details>
			</div>
		</Sheet>
	{:else}
		<!-- Desktop shell region for the StageRail (DESIGN.md §3.1 chrome left rail). -->
		<div class={cn("sticky top-0 h-screen")} data-shell-region="stage-rail">
			<AppSidebar activeProjectId={data.activeProjectId} />
		</div>
		<div class={cn("flex min-w-0 flex-1 flex-col")}>
			<div class={cn("flex items-center")}>
				<div class="flex-1">
					<AppTopbar
						pathname={page.url.pathname}
						activeProjectId={data.activeProjectId}
						onThemeToggle={toggleMode}
						{inferenceStatus}
					/>
				</div>
			</div>
			<main id="main-content" tabindex="-1" class={cn("flex-1 px-6 py-6")}>
				{@render children?.()}
			</main>
			<TraceFooter traceId={data?.traceId ?? null} requestId={data?.requestId ?? null} />
		</div>
	{/if}
</div>
