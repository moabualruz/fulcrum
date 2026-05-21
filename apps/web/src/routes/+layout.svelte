<script lang="ts">
	import type { Snippet } from "svelte";
	import { onMount } from "svelte";
	import { get } from "svelte/store";
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
		Banner,
		Chip,
		Kbd,
		MobileStageTabs,
		TraceBadge,
		TraceChip,
		type AcpDrawerAgentRow,
		type AcpDrawerMetaItem,
		type AcpDrawerSide,
	} from "@fulcrum/ui-kit";
	import {
		connectionState,
		hasQueuedMutations,
		initConnectionMonitor,
		queuedMutations,
		showConnectionBanner,
	} from "$lib/stores/connection";
	import {
		MOBILE_QUERY,
		browserDriver,
		isMobileViewport,
	} from "$lib/util/media-query";
	import { cn } from "$lib/utils.js";
	import { withTrace, type WorkflowStage } from "$lib/components/app/route-map.ts";
	import { STAGE_NAV_ITEMS, stageForPath as stageForNavPath } from "$lib/components/app/nav-data.ts";

	import type { InferenceStatus } from "$lib/components/app/AppTopbar.svelte";

	import "../app.css";
	import type { LayoutData } from "./$types";

	interface Props {
		data: LayoutData;
		children?: Snippet;
	}

	let { data, children }: Props = $props();

	let mobile = $state(isMobileViewport(browserDriver()));
	let paletteOpen = $state(false);
	let modifierChordUsed = false;
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
	let aiComposerTextarea = $state<HTMLTextAreaElement | null>(null);
	const aiDrawerSide = $derived<AcpDrawerSide>(mobile ? "bottom" : "right");
	const activeMobileStage = $derived(stageForNavPath(page.url.pathname));

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

	/*
	 * Global `g <letter>` stage chords + `[` StageRail toggle
	 * (`prd-web-stage-route-model`, IA-MAP.md §4.1).
	 *
	 *   g c|p|b|r|s|o  → the six WorkflowStages (Capture … Operate)
	 *   g d            → Dashboard (portfolio)
	 *   g i            → Inbox (portfolio)
	 *   [              → toggle the StageRail collapsed state
	 *
	 * The chord navigates to the canonical stage route when the current URL is
	 * already a `/<ws>/projects/<projId>/<stage>` path (it swaps only the
	 * `<stage>` segment, preserving `<ws>`/`<projId>` and the trace hash + filter
	 * query). On any other route it falls back to the stage's home route from
	 * `STAGE_NAV_ITEMS`. Either way the `#trace=<id>` hash and filter query
	 * survive (`withTrace`) so a stage hop never drops the active trace.
	 */
	let chordPending = $state(false);
	let chordTimer: ReturnType<typeof setTimeout> | undefined;
	let railCollapsed = $state(false);

	/*
	 * Shell connection banner (COPY.md §3 "Offline + queued mutation",
	 * cross-states.md §error.html). The shell — not a standalone route — owns the
	 * offline experience: the `connection.ts` store machine (offline | syncing |
	 * online) drives one Banner here. The former `offline` route's hard
	 * reconnect-redirect is discarded; going offline keeps the operator in place,
	 * so the active trace in `TraceFooter` survives (DESIGN.md §13 invariant 1).
	 * `queuedExpanded` toggles the inline "View queued changes" disclosure —
	 * errors live inline at the surface, never in a toast (COPY.md §3).
	 */
	let queuedExpanded = $state(false);
	/** Banner tone per connection state — danger offline, warning syncing. */
	const connectionBannerTone = $derived(
		$connectionState === "offline" ? "error" : "warning",
	);
	/** Verbatim COPY.md §3 offline + queued-mutation copy; never "Please try again". */
	const connectionBannerCopy = $derived(
		$connectionState === "offline"
			? "You're offline. This change is queued and will sync when you reconnect."
			: "Back online. Replaying your queued changes now.",
	);
	const connectionBannerTitle = $derived(
		$connectionState === "offline" ? "You're offline" : "Syncing queued changes",
	);
	function toggleQueuedChanges(): void {
		queuedExpanded = !queuedExpanded;
	}

	/** One chord key → its destination path (canonical when in project scope). */
	function chordDestination(key: string): string | null {
		const pathname = page.url.pathname;
		const segments = pathname.replace(/^\/+|\/+$/g, "").split("/");
		const inProjectScope = segments[1] === "projects" && segments.length >= 4;

		const STAGE_BY_KEY: Record<string, WorkflowStage> = {
			c: "capture",
			p: "plan",
			b: "build",
			r: "review",
			s: "ship",
			o: "operate",
		};
		const stage = STAGE_BY_KEY[key];
		if (stage) {
			if (inProjectScope) {
				// Canonical scope — swap only the `<stage>` segment.
				return `/${segments[0]}/projects/${segments[2]}/${stage}`;
			}
			// Legacy scope — fall back to the stage's home route.
			return STAGE_NAV_ITEMS.find((item) => item.stage === stage)?.href ?? null;
		}
		if (key === "d") return inProjectScope ? `/${segments[0]}/dashboard` : "/";
		if (key === "i") return inProjectScope ? `/${segments[0]}/inbox` : "/inbox";
		return null;
	}

	function navigateChord(key: string): void {
		const destination = chordDestination(key);
		if (!destination) return;
		void goto(withTrace(destination, page.url));
	}

	function navigateMobileStage(_stage: WorkflowStage, href: string): void {
		void goto(withTrace(href, page.url));
	}

	function toggleRailCollapsed(): void {
		railCollapsed = !railCollapsed;
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
		// Design-e2e seed: `?e2e_offline_queue=1` populates the connection store
		// with representative queued mutations so the rendered offline test can
		// prove the "View queued changes" affordance against the real shell. The
		// seed only fires on the explicit query param — never in production use.
		if (page.url.searchParams.get("e2e_offline_queue") === "1" && get(queuedMutations).length === 0) {
			queuedMutations.set([
				{ kind: "task.update", summary: "FUL-127 moved to In review" },
				{ kind: "comment.create", summary: "Review note on the trace dedupe run" },
			]);
		}
	});

	$effect(() => {
		if (typeof window === "undefined") return;
		document.body.dataset.fulcrumHydrated = "true";
		return () => {
			delete document.body.dataset.fulcrumHydrated;
		};
	});

	$effect(() => {
		if (!aiAssistOpen || typeof window === "undefined") return;
		requestAnimationFrame(() => {
			aiComposerTextarea?.focus();
		});
	});

	onMount(() => {
		window.addEventListener("keydown", onGlobalKeydown);
		window.addEventListener("keyup", onGlobalKeyup);
		const openHelp = () => (shortcutHelpOpen = true);
		window.addEventListener("fulcrum:open-shortcut-help", openHelp);
		// The StatusFooter `✨ AI Assist` segment + every per-Step `⊞ AI Assist`
		// mode button dispatch this event; the one shell drawer listens here.
		window.addEventListener("fulcrum:open-ai-assist", openAiAssist);
		// Shell connection monitor: tracks `navigator.onLine` + the window
		// `online`/`offline` events so the connection banner reflects reality on
		// every route (cross-states.md — `offline` + `cross-cutting-offline`
		// routes absorbed into this shell store).
		const teardownConnection = initConnectionMonitor();
		return () => {
			window.removeEventListener("keydown", onGlobalKeydown);
			window.removeEventListener("keyup", onGlobalKeyup);
			window.removeEventListener("fulcrum:open-shortcut-help", openHelp);
			window.removeEventListener("fulcrum:open-ai-assist", openAiAssist);
			teardownConnection();
			if (chordTimer) clearTimeout(chordTimer);
		};
	});

	function onGlobalKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const tag = typeof target?.tagName === "string" ? target.tagName.toLowerCase() : "";
		const inTextField = tag === "input" || tag === "textarea" || target?.isContentEditable === true;
		if ((event.metaKey || event.ctrlKey) && event.key !== "Meta" && event.key !== "Control") {
			modifierChordUsed = true;
		}
		if (event.key === "Escape" && aiAssistOpen) {
			aiAssistOpen = false;
			return;
		}
		// ⌘/ (or Ctrl+/) toggles the AI Assist drawer from any route. The meta/ctrl
		// modifier makes it a deliberate chord, so it fires inside text fields too
		// without stealing a literal "/" keystroke (IA-MAP.md §5 "⌘/ from anywhere").
		if (event.key === "/" && (event.metaKey || event.ctrlKey) && !event.altKey) {
			event.preventDefault();
			toggleAiAssist();
			return;
		}
		// `[` toggles the StageRail collapsed state (prd-web-stage-route-model).
		if (event.key === "[" && !event.metaKey && !event.ctrlKey && !event.altKey && !inTextField) {
			event.preventDefault();
			toggleRailCollapsed();
			return;
		}
		// `g <letter>` stage chord (IA-MAP.md §4.1). `g` arms a one-shot pending
		// state; the next letter within 1s resolves the destination. No modifier,
		// not inside a text field — leaves real typing untouched.
		if (!event.metaKey && !event.ctrlKey && !event.altKey && !inTextField) {
			if (chordPending) {
				const key = event.key.toLowerCase();
				if ("cpbrsodi".includes(key)) {
					event.preventDefault();
					chordPending = false;
					if (chordTimer) clearTimeout(chordTimer);
					navigateChord(key);
					return;
				}
				// Any other key cancels the pending chord.
				chordPending = false;
				if (chordTimer) clearTimeout(chordTimer);
			}
			if (event.key.toLowerCase() === "g") {
				event.preventDefault();
				chordPending = true;
				if (chordTimer) clearTimeout(chordTimer);
				chordTimer = setTimeout(() => {
					chordPending = false;
				}, 1_000);
				return;
			}
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
			if (modifierChordUsed) {
				modifierChordUsed = false;
				return;
			}
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
				bind:this={aiComposerTextarea}
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

<!--
	Shell connection banner (COPY.md §3, cross-states.md §error.html). Composed
	from the @fulcrum/ui-kit `Banner` primitive — AGENTS.md ui-kit rule: never a
	route-local overlay. One instance, rendered above `<main>` in both the mobile
	and desktop shell branches, driven by the `connection.ts` store. Shown only
	when offline or syncing; the inline "View queued changes" disclosure keeps the
	queued mutations at the surface instead of a banned error toast.
-->
{#snippet connectionBanner()}
	{#if $showConnectionBanner}
		<Banner
			tone={connectionBannerTone}
			title={connectionBannerTitle}
			data-shell-region="connection-banner"
			data-connection-state={$connectionState}
		>
			<p data-connection-message>{connectionBannerCopy}</p>
			{#if $hasQueuedMutations && queuedExpanded}
				<ul
					data-queued-changes-list
					class={cn("mt-2 grid gap-1 border-l-2 border-border pl-3")}
				>
					{#each $queuedMutations as mutation (mutation.kind + mutation.summary)}
						<li
							data-queued-change
							class={cn("flex flex-wrap items-baseline gap-x-2 text-xs")}
						>
							<code class={cn("font-mono text-fg-subtle")}>{mutation.kind}</code>
							<span>{mutation.summary}</span>
						</li>
					{/each}
				</ul>
			{/if}
			{#snippet actions()}
				{#if $hasQueuedMutations}
					<button
						type="button"
						data-view-queued-changes
						aria-expanded={queuedExpanded}
						onclick={toggleQueuedChanges}
						class={cn(
							"inline-flex h-8 items-center rounded-md border border-border bg-surface px-3",
							"text-xs font-medium text-fg hover:bg-surface-sunken",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					>
						{queuedExpanded ? "Hide queued changes" : "View queued changes"}
					</button>
				{/if}
			{/snippet}
		</Banner>
	{/if}
{/snippet}

<div class={cn("flex min-h-screen bg-background text-foreground")}>
	{#if mobile}
		<div class={cn("flex min-w-0 flex-1 flex-col")}>
			<div class={cn("flex items-center pt-[var(--fulcrum-safe-area-top)]")}>
				<div class="flex-1">
					<AppTopbar
						pathname={page.url.pathname}
						activeProjectId={data.activeProjectId}
						onThemeToggle={toggleMode}
					/>
				</div>
			</div>
			{@render connectionBanner()}
			<main id="main-content" tabindex="-1" class={cn("flex-1 px-6 pt-6 pb-[calc(6rem+var(--fulcrum-gesture-zone-bottom))]")}>
				{@render children?.()}
			</main>
			<!--
				Mobile shell bottom stage tabs replace the old hamburger SheetTrigger.
				AI Assist remains right-most and shares the global drawer with Cmd+/.
			-->
			<details
				data-mobile-trace-panel
				class={cn(
					"fixed inset-x-0 bottom-[calc(4rem+var(--fulcrum-gesture-zone-bottom))] z-50 border-y border-border",
					"bg-surface-elevated text-xs text-fg-subtle shadow-[0_-6px_18px_rgba(0,0,0,0.12)]",
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
			<MobileStageTabs
				items={STAGE_NAV_ITEMS}
				current={activeMobileStage}
				aiAssistOpen={aiAssistOpen}
				onNavigate={navigateMobileStage}
				onAiAssist={openAiAssist}
			/>
		</div>
	{:else}
		<!--
			Desktop shell region for the StageRail (DESIGN.md §3.1 chrome left rail).
			`[` toggles the collapsed state (prd-web-stage-route-model, IA-MAP.md
			§4.1): `data-rail-collapsed` is the shell-level state attribute the rail
			region carries; collapsed narrows the region to the 56px icon rail.
		-->
		<div
			class={cn("sticky top-0 h-screen overflow-hidden transition-[width]", railCollapsed ? "w-14" : "w-[220px]")}
			data-shell-region="stage-rail"
			data-rail-collapsed={railCollapsed ? "true" : "false"}
		>
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
			{@render connectionBanner()}
			<main id="main-content" tabindex="-1" class={cn("flex-1 px-6 py-6")}>
				{@render children?.()}
			</main>
			<TraceFooter traceId={data?.traceId ?? null} requestId={data?.requestId ?? null} />
		</div>
	{/if}
</div>
