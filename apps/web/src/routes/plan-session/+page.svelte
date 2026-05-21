<script lang="ts">
	/**
	 * `/<ws>/projects/<projId>/plan/<sessionId>` — the Plan-stage Live ACP session
	 * workbench (`prd-web-plan-session-od-fidelity`; OD `plan-session.html`;
	 * IA-MAP.md §2.2 "Live ACP session"; DESIGN.md §8 Live Session Pane).
	 *
	 * The OD prototype renders the Plan live session as the verbatim DESIGN.md §8
	 * three-column Live Session Pane:
	 *
	 *   sessions list (220px) │ transcript (flex) │ workspace dock (320px)
	 *
	 * with a sticky plan strip at the top of the transcript and the workspace
	 * dock tab set Shell · Files · Browser · Plan · Cost. Before this rebuild two
	 * parallel implementations existed — this OD-faithful shell with no dock and
	 * no sticky strip, and the service-wired forms on the legacy `/planning`
	 * route. This file is now the single rendered Plan live-session target;
	 * `/planning` and `/planning/sessions` redirect here, preserving every
	 * `ActionForm` mode and the `AcpSession` typing under the OD pane (the dock's
	 * **Plan** tab lists every planning mode + session action — value-preservation
	 * item 4: moved features stay findable).
	 *
	 * Composes `@fulcrum/ui-kit` primitives only — `Badge`, `Button`, `Chip`,
	 * `StatusBadge`, `TraceChip`, `Textarea`, `Tabs`, `EmptyState`, `ErrorBanner`,
	 * `Card` — never re-implements a primitive (AGENTS.md ui-kit rule). The OD
	 * shell chrome (StageRail / ScopeBar / StatusFooter / AcpDrawer) is provided
	 * by the root `+layout.svelte`; this route renders the Live Session Pane only.
	 */
	import { onMount } from "svelte";
	import {
		Badge,
		Button,
		Card,
		Chip,
		EmptyState,
		ErrorBanner,
		LoadingState,
		StatusBadge,
		Tabs,
		TabsContent,
		TabsList,
		TabsTrigger,
		Textarea,
		TraceChip,
	} from "@fulcrum/ui-kit";
	import { page } from "$app/state";

	/**
	 * ACP `session/update` notification kinds that drive the transcript
	 * (DESIGN.md §8: "ACP `session/update` notifications drive transcript").
	 */
	type TrafficKind =
		| "session/update"
		| "agent_message_chunk"
		| "tool_call"
		| "tool_call_update"
		| "trace_link";

	/** One transcript / traffic row — an ACP session event. */
	type TrafficRow = { id: string; kind: TrafficKind; at: string; summary: string; payload: string };

	/** A resumable planning session in the left sessions list. */
	type PlanSession = {
		id: string;
		sessionId: string;
		traceId: string;
		sourceDocId: string;
		title: string;
		status: "running" | "paused";
	};

	/**
	 * The Plan-stage workspace-dock **Plan** tab preserves every legacy
	 * `planning/` `ActionForm` mode by name, so the planning verbs that lived on
	 * the retired `/planning` route stay findable from the canonical session
	 * home. DESIGN.md §8: the dock's Plan tab is the planning-mode surface.
	 */
	const PLANNING_MODES: ReadonlyArray<{ mode: string; label: string; summary: string }> = [
		{ mode: "preview", label: "Preview plan", summary: "Parse approved markdown into a task breakdown" },
		{ mode: "materialize", label: "Materialize plan", summary: "Commit docs and tasks from the approved plan" },
		{ mode: "freeformStart", label: "Start freeform work", summary: "Open a freeform brief and seed a session" },
		{ mode: "freeformPrompt", label: "Build prompt", summary: "Compose an AI Assist prompt from selected docs" },
		{ mode: "guidedAcpStart", label: "Start guided session", summary: "Begin a guided AI Assist planning session" },
		{ mode: "guidedAcpSessionAction", label: "Session action", summary: "Resume, cancel, set mode, or resolve permission" },
		{ mode: "continuousUpdate", label: "Continuous update", summary: "Replan from updated docs, reconcile the task tree" },
		{ mode: "generate", label: "Generate technical plan", summary: "Produce reviewable prototype and boilerplate artifacts" },
		{ mode: "artifactExecution", label: "Run artifact", summary: "Execute a planned prototype or boilerplate artifact" },
		{ mode: "workflowCycle", label: "Run workflow cycle", summary: "freeform → planning → execution → QA → UAT → E2E" },
	] as const;

	/**
	 * `AcpSession` typing preserved verbatim from `planning/sessions/+page.svelte`
	 * — the guided session shape the Plan dock summarizes (value-preservation
	 * item 1: the typed mutation contract is not dropped by the migration).
	 */
	type AcpSession = {
		acpSessionId?: string;
		projectId?: string;
		traceId?: string;
		agentName?: string;
		cwd?: string;
		modeId?: string;
		modelId?: string;
		permissionMode?: string;
		sessionStatus?: string;
	};

	const STORAGE_KEY = "fulcrum.plan-session.workbench";
	const TRACE_ID = "tr_19b4a7c2e6f04d91";
	const SESSION_ID = "plan_sess_auth_rewrite";
	const SOURCE_DOC_ID = "doc_auth_rewrite";

	/** The guided AI Assist session the dock summarizes (preserved AcpSession typing). */
	const ACP_SESSION: AcpSession = {
		acpSessionId: SESSION_ID,
		traceId: TRACE_ID,
		agentName: "codex",
		cwd: "/Users/mkh/workspace/fulcrum",
		modeId: "planning",
		permissionMode: "review_each_tool",
		sessionStatus: "running",
	};

	const initialSessions: PlanSession[] = [
		{
			id: "sess-1",
			sessionId: SESSION_ID,
			traceId: TRACE_ID,
			sourceDocId: SOURCE_DOC_ID,
			title: "plan_sess_auth_rewrite",
			status: "running",
		},
	];

	const initialTraffic: TrafficRow[] = [
		{
			id: "evt-1",
			kind: "session/update",
			at: "10:41:02",
			summary: "Planning session started",
			payload: `{"session_id":"${SESSION_ID}","trace_id":"${TRACE_ID}","status":"running"}`,
		},
		{
			id: "evt-2",
			kind: "tool_call",
			at: "10:41:05",
			summary: "Loaded source document and linked tasks",
			payload: `{"tool":"planning.sources.read","source_doc_id":"${SOURCE_DOC_ID}","task_ids":["AUTH-42","AUTH-51"]}`,
		},
		{
			id: "evt-3",
			kind: "agent_message_chunk",
			at: "10:41:08",
			summary: "Drafted first plan outline",
			payload: '{"chunk":"Start with migration guard, then service contract, then web proof."}',
		},
	];

	/** Source / session / trace deep links — the trace-spine references. */
	const sourceLinks = $derived([
		{ label: "Source document", href: `/docs/${sourceDocId}/planning`, value: sourceDocId },
		{ label: "Session detail", href: `/planning/sessions#${sessionId}`, value: sessionId },
		{ label: "Trace summary", href: `/trace/${traceId}`, value: traceId },
	]);

	let sessions = $state<PlanSession[]>(initialSessions);
	let activeSessionId = $state(initialSessions[0]?.id ?? "");
	let prompt = $state(
		"Draft a plan from the source doc, keep trace links visible, and call out blockers.",
	);
	let sourceDocId = $state(SOURCE_DOC_ID);
	let sessionId = $state(SESSION_ID);
	let traceId = $state(TRACE_ID);
	let status = $state<"running" | "paused">("running");
	let traffic = $state<TrafficRow[]>(initialTraffic);
	let selectedEventId = $state(initialTraffic[1]?.id ?? "");
	let error = $state("");
	let resumed = $state(false);
	let dockTab = $state("shell");

	const activeSession = $derived(sessions.find((s) => s.id === activeSessionId) ?? null);
	const selectedEvent = $derived(traffic.find((row) => row.id === selectedEventId) ?? traffic[0] ?? null);
	const isEmpty = $derived(sessions.length === 0);
	const loadingState = $derived(page.url.searchParams.get("state") === "loading");

	onMount(() => {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		try {
			const saved = JSON.parse(raw) as {
				sessions?: PlanSession[];
				activeSessionId?: string;
				prompt?: string;
				sourceDocId?: string;
				sessionId?: string;
				traceId?: string;
				status?: "running" | "paused";
				traffic?: TrafficRow[];
				selectedEventId?: string;
				dockTab?: string;
			};
			sessions = saved.sessions ?? sessions;
			activeSessionId = saved.activeSessionId ?? activeSessionId;
			prompt = saved.prompt ?? prompt;
			sourceDocId = saved.sourceDocId ?? sourceDocId;
			sessionId = saved.sessionId ?? sessionId;
			traceId = saved.traceId ?? traceId;
			status = saved.status ?? status;
			traffic = saved.traffic?.length ? saved.traffic : traffic;
			selectedEventId = saved.selectedEventId ?? selectedEventId;
			dockTab = saved.dockTab ?? dockTab;
			resumed = true;
		} catch {
			window.localStorage.removeItem(STORAGE_KEY);
		}
	});

	$effect(() => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				sessions,
				activeSessionId,
				prompt,
				sourceDocId,
				sessionId,
				traceId,
				status,
				traffic,
				selectedEventId,
				dockTab,
			}),
		);
	});

	/**
	 * Submit the prompt — appends ACP stream traffic, or surfaces the COPY.md §3
	 * error. `error` holds only the `[why]. [exact next step]. trace=<id>`
	 * remainder; the `[what failed]` sentence is the ErrorBanner title.
	 */
	function submitPrompt(): void {
		if (!sourceDocId.trim() || !sessionId.trim() || !traceId.trim()) {
			error = `Fill missing IDs, or open trace ${TRACE_ID} in Audit. trace=${TRACE_ID}`;
			return;
		}
		error = "";
		const next = traffic.length + 1;
		const id = `evt-${next}`;
		traffic = [
			...traffic,
			{
				id,
				kind: "session/update",
				at: "10:42:14",
				summary: "Prompt submitted and persisted",
				payload: JSON.stringify({ session_id: sessionId, source_doc_id: sourceDocId, trace_id: traceId, prompt }),
			},
			{
				id: `evt-${next + 1}`,
				kind: "tool_call_update",
				at: "10:42:18",
				summary: "Plan workspace updated",
				payload: '{"plan_strip":"migration guard -> service contract -> web proof","persisted":true}',
			},
		];
		selectedEventId = id;
		status = "running";
	}

	function pause(): void {
		status = "paused";
	}

	function resume(): void {
		status = "running";
		resumed = true;
	}

	function clearSourceIds(): void {
		sourceDocId = "";
		sessionId = "";
	}

	/** Empty the sessions list — drives the COPY.md §2 Plan empty state. */
	function clearAllSessions(): void {
		sessions = [];
		activeSessionId = "";
	}

	/** Re-seed the demo session — the empty-state "Start planning" action. */
	function startPlanning(): void {
		sessions = initialSessions;
		activeSessionId = initialSessions[0]?.id ?? "";
		sourceDocId = SOURCE_DOC_ID;
		sessionId = SESSION_ID;
		traceId = TRACE_ID;
		status = "running";
	}

	/** Select a session from the left list. */
	function selectSession(s: PlanSession): void {
		activeSessionId = s.id;
		sessionId = s.sessionId;
		traceId = s.traceId;
		sourceDocId = s.sourceDocId;
		status = s.status;
	}
</script>

<svelte:head>
	<title>Plan session | Fulcrum</title>
</svelte:head>

<!--
	The DESIGN.md §8 Live Session Pane: a three-column grid —
	sessions list (220px) │ transcript (flex) │ workspace dock (320px).
	`data-state` exposes the populated / empty branch to design-e2e.
-->
<section
	data-route="plan-session"
	data-stage="plan"
	data-plan-session-page
	data-state={loadingState ? "loading" : isEmpty ? "empty" : "populated"}
	class="grid min-h-[36rem] gap-4 lg:grid-cols-[220px_minmax(0,1fr)_320px]"
>
	{#if loadingState}
		<div class="lg:col-span-3">
			<LoadingState
				title="Loading Plan session"
				description="Fetching sessions, transcript events, and workspace dock state."
				shape="feed"
				rows={4}
			/>
		</div>
	{:else}
	<!-- ── Column 1 — sessions list (220px) ───────────────────────────── -->
	<aside
		data-slot="session-list"
		data-session-list
		aria-label="Planning sessions"
		class="grid h-max content-start gap-3 rounded-md border border-border bg-card p-4"
	>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<h1 class="text-base font-semibold tracking-normal text-foreground">AI Assist planning</h1>
			<StatusBadge status={status === "running" ? "running" : "paused"} />
		</div>
		<p class="text-xs leading-5 text-muted-foreground">
			Live planning sessions stay resumable across reloads.
		</p>

		{#if isEmpty}
			<EmptyState
				data-plan-session-empty
				title="No planning sessions yet."
				description="Sessions appear here when you start planning or hand off from a doc in Capture."
				keyHint="Press n or hand off from a doc in Capture."
			>
				{#snippet actions()}
					<Button size="sm" data-start-planning onclick={startPlanning}>Start planning</Button>
				{/snippet}
			</EmptyState>
		{:else}
			<ul class="grid gap-2" data-session-cards>
				{#each sessions as s (s.id)}
					<li>
						<button
							type="button"
							data-session-card={s.sessionId}
							data-selected={s.id === activeSessionId}
							aria-current={s.id === activeSessionId ? "true" : undefined}
							class="grid w-full gap-1 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {s.id ===
							activeSessionId
								? 'border-accent bg-accent/10'
								: 'border-border hover:bg-muted/50'}"
							onclick={() => selectSession(s)}
						>
							<span class="block text-sm font-semibold text-foreground">{s.title}</span>
							<span class="block font-mono text-[11px] text-muted-foreground">{s.traceId}</span>
						</button>
					</li>
				{/each}
			</ul>

			<div class="grid gap-2" data-session-actions>
				<Button type="button" variant="outline" size="sm" onclick={pause}>Pause</Button>
				<Button type="button" size="sm" data-resume-session onclick={resume}>Resume session</Button>
				<Button type="button" variant="ghost" size="sm" data-clear-sessions onclick={clearAllSessions}>
					Clear sessions
				</Button>
			</div>

			{#if resumed}
				<p
					data-session-resumed
					class="rounded-md bg-muted p-2 text-xs text-muted-foreground"
				>
					Session restored from local persistence.
				</p>
			{/if}
		{/if}
	</aside>

	<!-- ── Column 2 — transcript (flex), with sticky plan strip ────────── -->
	<section
		data-slot="session-transcript"
		data-live-session-pane
		class="flex min-w-0 flex-col rounded-md border border-border bg-card"
	>
		<!-- Sticky plan strip — DESIGN.md §8 "sticky plan strip at top of transcript". -->
		<header
			data-slot="plan-strip"
			data-plan-strip
			class="sticky top-0 z-10 border-b border-border bg-card p-4"
		>
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="secondary">Plan</Badge>
				<TraceChip traceId={traceId || TRACE_ID} />
				<Chip tone="success">source linked</Chip>
			</div>
			<div class="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
				<div class="min-w-0">
					<h2 class="text-lg font-semibold tracking-normal text-foreground">
						Persistent planning workspace
					</h2>
					<p class="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
						Prompt, source IDs, traffic events, and trace summary links remain visible while the
						planning run streams.
					</p>
				</div>
				<nav
					class="flex flex-wrap gap-2 text-xs"
					aria-label="Planning links"
					data-trace-source-links
				>
					{#each sourceLinks as link (link.label)}
						<a
							class="rounded-md border border-border px-2 py-1 font-mono hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							href={link.href}
						>
							{link.label}: {link.value}
						</a>
					{/each}
				</nav>
			</div>
		</header>

		<!-- Composer — prompt + required IDs + inline COPY.md §3 error recovery. -->
		<form
			class="grid gap-3 border-b border-border p-4"
			data-plan-session-form
			onsubmit={(event) => {
				event.preventDefault();
				submitPrompt();
			}}
		>
			<div class="grid gap-3 md:grid-cols-3">
				<label class="grid gap-1 text-xs font-semibold text-muted-foreground">
					Source doc ID
					<input
						class="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						bind:value={sourceDocId}
						data-source-doc-input
					/>
				</label>
				<label class="grid gap-1 text-xs font-semibold text-muted-foreground">
					Session ID
					<input
						class="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						bind:value={sessionId}
						data-session-id-input
					/>
				</label>
				<label class="grid gap-1 text-xs font-semibold text-muted-foreground">
					Trace ID
					<input
						class="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						bind:value={traceId}
						data-trace-id-input
					/>
				</label>
			</div>

			<label class="grid gap-1 text-xs font-semibold text-muted-foreground">
				Prompt
				<Textarea
					bind:value={prompt}
					data-plan-prompt
					class="min-h-24 text-sm leading-6"
				/>
			</label>

			{#if error}
				<!--
					COPY.md §3 error template: `[what failed]. [why]. [exact next
					step]. trace=<id>`. The full template — including the literal
					`trace=<id>` token — is rendered as the ErrorBanner message so
					the copy lock matches OD `plan-session.html` verbatim; the
					primitive's separate `traceId` slot uses `trace <id>`, a
					different token, so it is intentionally not passed here.
				-->
				<ErrorBanner
					data-plan-session-error
					surface="form"
					title="Planning needs source, session, and trace IDs."
					message={error}
				/>
			{/if}

			<div class="flex flex-wrap justify-between gap-2">
				<Button type="button" variant="outline" size="sm" data-clear-ids onclick={clearSourceIds}>
					Clear required IDs
				</Button>
				<Button type="submit" size="sm" data-submit-prompt>Submit prompt</Button>
			</div>
		</form>

		<!-- Transcript — the ACP traffic stream + selected-event raw tool-call detail. -->
		<div class="grid min-h-0 flex-1 2xl:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)]">
			<div
				data-slot="transcript-stream"
				data-transcript
				class="flex min-w-0 flex-col overflow-y-auto border-b border-border 2xl:border-r 2xl:border-b-0"
			>
				<div
					class="flex items-center justify-between border-b border-border px-4 py-3"
				>
					<h3 class="text-sm font-semibold tracking-normal text-foreground">Traffic stream</h3>
					<span class="font-mono text-[11px] text-muted-foreground" data-traffic-count>
						{traffic.length} events
					</span>
				</div>
				<ol class="grid gap-0" data-traffic-stream>
					{#each traffic as row (row.id)}
						<li>
							<button
								type="button"
								class="grid w-full grid-cols-[8rem_minmax(0,1fr)] gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {selectedEventId ===
								row.id
									? 'bg-muted'
									: ''}"
								data-traffic-event={row.id}
								data-selected={selectedEventId === row.id}
								aria-current={selectedEventId === row.id ? "true" : undefined}
								onclick={() => {
									selectedEventId = row.id;
								}}
							>
								<span class="font-mono text-[11px] text-muted-foreground">
									{row.at}<br />{row.kind}
								</span>
								<span class="min-w-0 text-sm text-foreground">{row.summary}</span>
							</button>
						</li>
					{/each}
				</ol>
			</div>

			<aside
				data-slot="transcript-inspector"
				data-traffic-inspector
				class="min-w-0 overflow-y-auto p-4"
			>
				{#if selectedEvent}
					<div class="flex flex-wrap items-center gap-2">
						<Chip tone="neutral">{selectedEvent.kind}</Chip>
						<span class="font-mono text-[11px] text-muted-foreground">{selectedEvent.id}</span>
					</div>
					<h3 class="mt-3 text-sm font-semibold text-foreground">{selectedEvent.summary}</h3>
					<pre
						class="mt-3 max-h-72 overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">{selectedEvent.payload}</pre>
				{/if}
			</aside>
		</div>
	</section>

	<!-- ── Column 3 — workspace dock (320px), tabs Shell · Files · Browser · Plan · Cost ─ -->
	<aside
		data-slot="workspace-dock"
		data-workspace-dock
		aria-label="Workspace dock"
		class="grid h-max content-start gap-3 rounded-md border border-border bg-card p-4"
	>
		<Tabs bind:value={dockTab}>
			<TabsList class="flex w-full flex-wrap gap-1" data-dock-tabs>
				<TabsTrigger value="shell" data-dock-tab="shell" class="flex-1">Shell</TabsTrigger>
				<TabsTrigger value="files" data-dock-tab="files" class="flex-1">Files</TabsTrigger>
				<TabsTrigger value="browser" data-dock-tab="browser" class="flex-1">Browser</TabsTrigger>
				<TabsTrigger value="plan" data-dock-tab="plan" class="flex-1">Plan</TabsTrigger>
				<TabsTrigger value="cost" data-dock-tab="cost" class="flex-1">Cost</TabsTrigger>
			</TabsList>

			<TabsContent value="shell" data-dock-panel="shell" class="grid gap-2">
				<h2 class="text-sm font-semibold text-foreground">Trace summary</h2>
				<p class="font-mono text-xs text-muted-foreground">{traceId || TRACE_ID}</p>
				<Card class="grid gap-1 p-3">
					<span class="text-xs font-semibold text-foreground">Session</span>
					<span class="font-mono text-xs text-muted-foreground">{sessionId || "missing"}</span>
				</Card>
				<Card class="grid gap-1 p-3">
					<span class="text-xs font-semibold text-foreground">Source doc</span>
					<span class="font-mono text-xs text-muted-foreground">{sourceDocId || "missing"}</span>
				</Card>
				<Card class="grid gap-1 p-3">
					<span class="text-xs font-semibold text-foreground">Current state</span>
					<span class="text-xs text-muted-foreground">{status}</span>
				</Card>
				<a
					class="mt-1 inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					href={`/trace/${traceId || TRACE_ID}`}
					data-open-trace
				>
					Open trace summary
				</a>
			</TabsContent>

			<TabsContent value="files" data-dock-panel="files" class="grid gap-2">
				<h2 class="text-sm font-semibold text-foreground">Source files</h2>
				<Card class="grid gap-1 p-3">
					<span class="font-mono text-xs text-foreground">{sourceDocId || "missing"}</span>
					<span class="text-xs text-muted-foreground">Linked source document</span>
				</Card>
			</TabsContent>

			<TabsContent value="browser" data-dock-panel="browser" class="grid gap-2">
				<h2 class="text-sm font-semibold text-foreground">Browser</h2>
				<p class="text-xs text-muted-foreground">
					Live previews of artifacts produced by this planning session appear here.
				</p>
			</TabsContent>

			<TabsContent value="plan" data-dock-panel="plan" class="grid gap-2">
				<h2 class="text-sm font-semibold text-foreground">Planning modes</h2>
				<p class="text-xs text-muted-foreground">
					Every planning verb the session can run, with the guided session it acts on.
				</p>
				<ul class="grid gap-2" data-planning-modes>
					{#each PLANNING_MODES as entry (entry.mode)}
						<li>
							<Card class="grid gap-1 p-3" data-planning-mode={entry.mode}>
								<span class="text-xs font-semibold text-foreground">{entry.label}</span>
								<span class="text-xs text-muted-foreground">{entry.summary}</span>
							</Card>
						</li>
					{/each}
				</ul>
				<Card class="grid gap-1 p-3" data-acp-session={ACP_SESSION.acpSessionId}>
					<span class="text-xs font-semibold text-foreground">Guided session</span>
					<span class="font-mono text-[11px] text-muted-foreground">
						{ACP_SESSION.agentName} · {ACP_SESSION.modeId} · {ACP_SESSION.permissionMode}
					</span>
				</Card>
			</TabsContent>

			<TabsContent value="cost" data-dock-panel="cost" class="grid gap-2">
				<h2 class="text-sm font-semibold text-foreground">Cost</h2>
				<Card class="grid gap-1 p-3">
					<span class="text-xs font-semibold text-foreground">Tokens this session</span>
					<span class="font-mono text-xs text-muted-foreground">—</span>
				</Card>
			</TabsContent>
		</Tabs>
	</aside>
	{/if}
</section>
