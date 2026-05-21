<script lang="ts">
	/**
	 * `/<ws>/projects/<projId>/plan/<planId>/review` — the Plan-stage review
	 * surface (`prd-web-plan-review-od-fidelity`; OD `plan-review.html`;
	 * IA-MAP.md §2.2 "Plan + prototype + tasks tripane"; IA-MAP.md §4.4
	 * Plannotator review; DESIGN.md §4.5 tool-call cards / §4.6 inline diff).
	 *
	 * The OD prototype renders the Plan review as a single-approve-gate tripane:
	 *
	 *   ┌ review-head — crumbs · plan title · waiting-input badge · mode-row ┐
	 *   ├ tab bar — Plan & prototype · Comments · Free chat · History         ┤
	 *   │ panes  — plan markdown (1.1fr) │ prototype callout (1fr) │ tasks    │
	 *   └ gate   — Request changes · Save without promoting · Approve ⌘↵      ┘
	 *
	 * IA-MAP.md §2.2: the review gate "approves all three [plan + prototype +
	 * tasks] as one unit"; the Plannotator `Mod+Enter` overload (COPY.md §539 /
	 * research-07 §4.1) approves when there are zero annotations and sends
	 * feedback when annotations exist — that exact overload is wired to the
	 * `Approve & promote to Build  ⌘↵` button and the global `Mod+Enter` handler.
	 *
	 * The route name was previously occupied by a mislabelled six-stage
	 * workflow-status tracker plus automation-rule builder, Jira import, and
	 * custom-field config — a Build/Operate-settings surface. That content was
	 * already re-homed to `/settings` by `prd-cross-mislabeled-route-content-
	 * migration` (its full markup is preserved under `_migrated-content/`); this
	 * file replaces the interim 308-redirect with the genuine OD tripane.
	 *
	 * Composes `@fulcrum/ui-kit` primitives only — `Breadcrumb`, `StatusBadge`,
	 * `ModeRow`, `Tabs`, `Button`, `Card`, `Chip`, `Badge`, `TraceChip`,
	 * `Textarea`, `Kbd` — never re-implements a primitive (AGENTS.md ui-kit
	 * rule). The OD shell chrome (StageRail / ScopeBar / StatusFooter / AcpDrawer)
	 * is provided by the root `+layout.svelte`; this route renders the review
	 * tripane only.
	 */
	import {
		Badge,
		Breadcrumb,
		Button,
		Card,
		Chip,
		Kbd,
		ModeRow,
		StatusBadge,
		Tabs,
		TabsContent,
		TabsList,
		TabsTrigger,
		Textarea,
		TraceChip,
	} from "@fulcrum/ui-kit";

	/** A plan-markdown section that can carry an inline comment anchor. */
	type PlanSection = {
		/** Stable anchor id — the `data-commentable` token comment threads bind to. */
		anchor: string;
		/** Heading / callout title. */
		heading: string;
		/** `h2` body section, the risk `callout`, or the `h3` references block. */
		kind: "section" | "callout" | "references";
		/** Rendered body — paragraphs, ordered/unordered list items. */
		body: { type: "p" | "ol" | "ul"; items: string[] };
		/** Open thread count, surfaced as a `data-comments` chip in the markdown. */
		comments: number;
	};

	/** A task card in the breakdown pane — one unit of the approved plan. */
	type PlanTask = {
		/** Stable anchor id — the per-task `data-commentable` token. */
		anchor: string;
		title: string;
		status: "pending";
		/** Assigned agent identifier (OD `.meta .assign`). */
		agent: string;
		/** Human estimate string (OD `~25 min`). */
		estimate: string;
		/** File / folder scope the task touches. */
		scope: string;
		/** Open thread count on this task. */
		comments: number;
	};

	/** A comment in an anchored review thread. */
	type ThreadComment = {
		author: string;
		/** `human` reviewer or `agent` reply (OD `.av.agent`). */
		role: "human" | "agent";
		at: string;
		text: string;
		/** Optional status pill on an agent reply (OD `acted` / `searching`). */
		pill?: { status: "completed" | "running"; label: string };
	};

	/** One review thread, anchored to a plan / prototype / task section. */
	type ReviewThread = {
		/** The `data-commentable` anchor this thread is attached to. */
		anchor: string;
		/** Where the anchor lives — drives the OD anchor icon + label. */
		surface: "plan" | "prototype" | "task";
		/** Human-readable anchor label (OD `Plan · Why · §1`). */
		label: string;
		resolved: boolean;
		comments: ThreadComment[];
	};

	/** A free-chat message — reviewers + AI in one stream. */
	type ChatMessage = {
		author: string;
		role: "human" | "agent";
		at: string;
		text: string;
		pill?: { status: "running"; label: string };
	};

	/** A plan revision in the History tab. */
	type PlanRevision = {
		label: string;
		at: string;
		source: string;
		summary: string;
		diff: string;
		role: "human" | "agent";
	};

	const TRACE_ID = "tr_8f29a4c1b3e0d5f7";
	const PLAN_ID = "auth-rewrite";
	const PLAN_TITLE = "Rewrite auth session token rotation";
	const STORAGE_KEY = "fulcrum.plan-review.workbench";

	/**
	 * Pane 1 — the plan markdown, section by section, each carrying its
	 * `data-commentable` anchor (OD `plan-review.html` lines 230-265). Comment
	 * anchors bind to these anchors (interaction_assertion 1).
	 */
	const PLAN_SECTIONS: ReadonlyArray<PlanSection> = [
		{
			anchor: "plan-why",
			heading: "Why",
			kind: "section",
			comments: 2,
			body: {
				type: "p",
				items: [
					"Session tokens today are stable per user. A stolen token requires nuking every device that user uses. Four support tickets this week (lost laptop scenario). Cost: high. Solution sketched in capture/token-rotation.md.",
				],
			},
		},
		{
			anchor: "plan-risk",
			heading: "Risk · existing sessions",
			kind: "callout",
			comments: 1,
			body: {
				type: "p",
				items: [
					"Mid-migration, in-flight tokens issued under the old scheme must still verify until they naturally expire (≤ 14 days). Plan ships a dual-verify path then sunsets.",
				],
			},
		},
		{
			anchor: "plan-approach",
			heading: "Approach",
			kind: "section",
			comments: 1,
			body: {
				type: "ol",
				items: [
					"Add kid + rotate to signToken; backfill issuance row per device.",
					"verifyToken looks up kid; rejects revoked rows; falls back to legacy verify for tokens without kid (sunset 2026-06-01).",
					"New endpoint DELETE /sessions/:kid for per-device revoke.",
					"Rate limiter buckets by kid not user.",
					"Telemetry: auth.session.issued + auth.session.revoked with kid.",
				],
			},
		},
		{
			anchor: "plan-oos",
			heading: "Out of scope",
			kind: "section",
			comments: 0,
			body: {
				type: "ul",
				items: [
					"OAuth refresh-token rotation (separate effort, tracked in oauth/rotation).",
					"Admin-side “log out everywhere” UI — owned by ops surface, not this plan.",
				],
			},
		},
		{
			anchor: "plan-acceptance",
			heading: "Acceptance",
			kind: "section",
			comments: 1,
			body: {
				type: "ul",
				items: [
					"New login issues a kid; revoking one kid does not log out other devices for the same user.",
					"Existing tokens continue to verify until natural expiry.",
					"Rate limiter does not throttle a quiet device because a noisy device on the same user is being abused.",
					"Issuance + revocation events surface in telemetry within 30s.",
				],
			},
		},
		{
			anchor: "plan-references",
			heading: "References",
			kind: "references",
			comments: 0,
			body: {
				type: "ul",
				items: [
					"capture/token-rotation.md · seedling (this plan's source)",
					"research/02-agent-supervision.md · session ID propagation",
				],
			},
		},
	] as const;

	/** Pane 2 — the embedded prototype callout device rows (OD lines 282-305). */
	const PROTOTYPE_DEVICES: ReadonlyArray<{
		device: string;
		where: string;
		current: boolean;
		action: { label: string; tone: "outline" | "ghost" | "destructive" | "disabled" };
	}> = [
		{
			device: "MacBook Pro · Chrome",
			where: "San Francisco · 192.0.2.41 · now",
			current: true,
			action: { label: "Current", tone: "disabled" },
		},
		{
			device: "iPhone 15 · Safari",
			where: "San Francisco · 192.0.2.42 · 3 min ago",
			current: false,
			action: { label: "Revoke", tone: "ghost" },
		},
		{
			device: "Laptop · Firefox",
			where: "Berlin · 198.51.100.7 · 14 days ago",
			current: false,
			action: { label: "Revoke", tone: "destructive" },
		},
	] as const;

	/** Pane 3 — the task breakdown (OD lines 320-390). */
	const PLAN_TASKS: ReadonlyArray<PlanTask> = [
		{ anchor: "task-1", title: "Add kid + rotate flag to signToken", status: "pending", agent: "claude-opus-4.7", estimate: "~25 min", scope: "src/auth/session.ts", comments: 2 },
		{ anchor: "task-2", title: "Persist issuance row per kid", status: "pending", agent: "claude-opus-4.7", estimate: "~30 min", scope: "2 files", comments: 0 },
		{ anchor: "task-3", title: "verifyToken: lookup kid, dual-verify legacy", status: "pending", agent: "claude-opus-4.7", estimate: "~40 min", scope: "src/auth/verify.ts", comments: 0 },
		{ anchor: "task-4", title: "DELETE /sessions/:kid endpoint", status: "pending", agent: "gpt-5.4", estimate: "~20 min", scope: "routes/sessions.ts", comments: 0 },
		{ anchor: "task-5", title: "Migration: sessions table + kid index", status: "pending", agent: "sonnet-4.6", estimate: "~15 min", scope: "db/migrations", comments: 0 },
		{ anchor: "task-6", title: "Rate-limiter: bucket per kid", status: "pending", agent: "claude-opus-4.7", estimate: "~30 min", scope: "src/limit/", comments: 0 },
		{ anchor: "task-7", title: "Telemetry events + dashboard tile", status: "pending", agent: "gemini-3-pro", estimate: "~25 min", scope: "telemetry/", comments: 1 },
		{ anchor: "task-8", title: "Settings UI · active sessions list (from callout)", status: "pending", agent: "sonnet-4.6", estimate: "~50 min", scope: "app/settings/sessions", comments: 0 },
	] as const;

	/** All anchored review threads — spanning plan / prototype / task surfaces. */
	const REVIEW_THREADS: ReadonlyArray<ReviewThread> = [
		{
			anchor: "plan-why",
			surface: "plan",
			label: "Plan · Why · §1",
			resolved: false,
			comments: [
				{
					author: "Jordan Tate",
					role: "human",
					at: "11:42",
					text: "Four tickets in a week is real but I'd link the actual incidents. Otherwise reviewers will treat “high cost” as vibes.",
				},
				{
					author: "claude-opus-4.7",
					role: "agent",
					at: "11:44",
					pill: { status: "completed", label: "acted" },
					text: "Linked support/INC-4421, INC-4438, INC-4451, INC-4467. Patched into capture/token-rotation.md. Plan updated automatically.",
				},
			],
		},
		{
			anchor: "plan-risk",
			surface: "plan",
			label: "Plan · Risk · existing sessions",
			resolved: false,
			comments: [
				{
					author: "You",
					role: "human",
					at: "11:52",
					text: "14-day sunset is too long. Existing tokens issued before this ships should be force-rotated after 7 days — otherwise we leave the attack window wide for the lost-laptop case we are explicitly fixing.",
				},
			],
		},
		{
			anchor: "plan-step-2",
			surface: "plan",
			label: "Plan · Approach · step 2",
			resolved: false,
			comments: [
				{
					author: "Priya Shah",
					role: "human",
					at: "12:01",
					text: "What's the behavior if dual-verify both succeed? We should reject not accept — picking the wrong key silently is the bug we'll spend a quarter chasing.",
				},
			],
		},
		{
			anchor: "proto-sessions",
			surface: "prototype",
			label: "Prototype · Active sessions UI",
			resolved: false,
			comments: [
				{
					author: "You",
					role: "human",
					at: "12:10",
					text: "Move “this device” to a row pill rather than the title — easier to scan when you have 6 sessions. Also we need a “Revoke all other devices” action.",
				},
			],
		},
		{
			anchor: "task-1",
			surface: "task",
			label: "Task · Add kid + rotate flag",
			resolved: false,
			comments: [
				{
					author: "Jordan Tate",
					role: "human",
					at: "12:15",
					text: "25 min is optimistic. We need to refactor 4 call sites + add fixtures. I'd peg this 60–90 min for opus.",
				},
				{
					author: "claude-opus-4.7",
					role: "agent",
					at: "12:16",
					text: "Re-checked: 4 call sites confirmed (auth/session.ts, auth/login.ts, oauth/issue.ts, jobs/issue.ts). Estimate updated to 65 min.",
				},
			],
		},
		{
			anchor: "task-7",
			surface: "task",
			label: "Task · Telemetry events",
			resolved: true,
			comments: [
				{
					author: "Priya Shah",
					role: "human",
					at: "12:20",
					text: "Add a dashboard tile for revoked / issued ratio. If that ratio spikes we may be under attack.",
				},
			],
		},
	] as const;

	/** Free-chat stream — reviewers + AI together (OD lines 537-576). */
	const CHAT_MESSAGES: ReadonlyArray<ChatMessage> = [
		{
			author: "Jordan Tate",
			role: "human",
			at: "11:40",
			text: "Quick gut-check before I dig in: are we sure we want to ship this before the OAuth refresh-rotation work? Same surface, related risks.",
		},
		{
			author: "You",
			role: "human",
			at: "11:41",
			text: "Yes — they touch different code paths and OAuth refresh is owned by Sam. Different shipping cadence. This one is bounded.",
		},
		{
			author: "claude-opus-4.7",
			role: "agent",
			at: "11:43",
			pill: { status: "running", label: "searching" },
			text: "Confirmed: oauth/refresh module last touched 6 weeks ago, owner @sam-l. No overlapping files with this plan. Diff radius: 11 files, all under src/auth/ and db/migrations/.",
		},
		{
			author: "Priya Shah",
			role: "human",
			at: "12:18",
			text: "Left specific notes on the step 2 and telemetry sections. Once those are addressed I'm 👍.",
		},
		{
			author: "You",
			role: "human",
			at: "just now",
			text: "@claude generate the dual-verify reject-on-both rule as a small code change preview before I approve.",
		},
	] as const;

	/** Plan revision history (OD lines 596-617). */
	const PLAN_REVISIONS: ReadonlyArray<PlanRevision> = [
		{
			label: "Revision 3",
			at: "11:44",
			source: "auto-patch from comment on plan-why",
			summary: "Linked 4 support incidents into the Why section.",
			diff: "+ 4 · − 0",
			role: "agent",
		},
		{
			label: "Revision 2",
			at: "11:30",
			source: "manual edit",
			summary: "Split Approach from Out of scope. Tightened acceptance bullets.",
			diff: "+ 6 · − 2",
			role: "human",
		},
		{
			label: "Revision 1",
			at: "10:58",
			source: "generated from capture/token-rotation.md",
			summary: "Initial plan generated. 5 acceptance criteria, 8 task breakdown, 1 prototype callout.",
			diff: "+ 41 · − 0",
			role: "agent",
		},
	] as const;

	/**
	 * The Plannotator annotation set. IA-MAP.md §4.4 / COPY.md §539: a review
	 * carries zero-or-more annotations. The `Mod+Enter` overload approves when
	 * this set is empty and sends feedback when it is not — so the gate's primary
	 * action and the `⌘↵` chord are a single overloaded control.
	 */
	const initialAnnotations = REVIEW_THREADS.filter((t) => !t.resolved).map((t) => t.anchor);

	let activeTab = $state("content");
	let reviewMode = $state<"manual" | "play" | "discuss" | "assist">("play");
	let annotations = $state<string[]>(initialAnnotations);
	let requestChangesOpen = $state(false);
	let gateOutcome = $state<"" | "approved" | "feedback-sent" | "saved" | "changes-requested">("");
	let chatDraft = $state("");
	let requestChangesNote = $state("");
	let restored = $state(false);

	/** Open (unresolved) annotations drive the Mod+Enter overload branch. */
	const openAnnotationCount = $derived(annotations.length);
	/** With zero annotations the gate approves; otherwise Mod+Enter sends feedback. */
	const willApprove = $derived(openAnnotationCount === 0);
	const planSectionCount = PLAN_SECTIONS.length;
	const taskCount = PLAN_TASKS.length;
	const threadCount = REVIEW_THREADS.length;
	const totalComments = REVIEW_THREADS.reduce((sum, t) => sum + t.comments.length, 0);
	const chatCount = CHAT_MESSAGES.length;
	const revisionCount = PLAN_REVISIONS.length;

	/** True while `anchor` still carries an open (unresolved) annotation. */
	function isOpen(anchor: string): boolean {
		return annotations.includes(anchor);
	}

	/**
	 * The OD `Mod+Enter` overload (COPY.md §539, IA-MAP.md §2.2 line 198):
	 * approve the plan + prototype + tasks as one unit when there are no open
	 * annotations; otherwise send the accumulated annotations back as feedback.
	 * Sending feedback does not silently resolve the reviewer's threads — the
	 * reviewer still owns each thread; only an explicit Resolve clears one.
	 */
	function submitGate(): void {
		requestChangesOpen = false;
		gateOutcome = willApprove ? "approved" : "feedback-sent";
	}

	/** Save the in-progress review without promoting to Build. */
	function saveWithoutPromoting(): void {
		gateOutcome = "saved";
		requestChangesOpen = false;
	}

	/** Open the inline Request-changes bar. */
	function openRequestChanges(): void {
		requestChangesOpen = true;
		gateOutcome = "";
	}

	/** Submit the Request-changes review — promotes nothing, notifies reviewers. */
	function submitRequestChanges(): void {
		gateOutcome = "changes-requested";
		requestChangesOpen = false;
	}

	/** Resolve a thread — clears its annotation so the gate can flip to approve. */
	function resolveThread(anchor: string): void {
		annotations = annotations.filter((a) => a !== anchor);
		gateOutcome = "";
	}

	/** Re-open every thread — restores the send-feedback branch of the overload. */
	function reopenAllThreads(): void {
		annotations = REVIEW_THREADS.filter((t) => !t.resolved).map((t) => t.anchor);
		gateOutcome = "";
	}

	/**
	 * Window-level `Mod+Enter` — the Plannotator chord. Mirrors the gate button
	 * so a keyboard reviewer triggers the same approve/send-feedback overload
	 * without reaching the mouse (COPY.md §539).
	 */
	function onKeydown(event: KeyboardEvent): void {
		if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		submitGate();
	}

	$effect(() => {
		if (typeof window === "undefined") return;
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (raw && !restored) {
			try {
				const saved = JSON.parse(raw) as {
					activeTab?: string;
					reviewMode?: "manual" | "play" | "discuss" | "assist";
					annotations?: string[];
					gateOutcome?: typeof gateOutcome;
				};
				if (saved.activeTab) activeTab = saved.activeTab;
				if (saved.reviewMode) reviewMode = saved.reviewMode;
				if (saved.annotations) annotations = saved.annotations;
				if (saved.gateOutcome) gateOutcome = saved.gateOutcome;
			} catch {
				window.localStorage.removeItem(STORAGE_KEY);
			}
			restored = true;
		}
		window.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ activeTab, reviewMode, annotations, gateOutcome }),
		);
	});
</script>

<svelte:head>
	<title>Plan review · {PLAN_ID} | Fulcrum</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<!--
	The OD `plan-review.html` tripane: a four-row grid — review head, tab bar,
	the active panel, and the bottom approve gate. `data-state` exposes the
	populated branch to design-e2e; `data-has-annotations` exposes the
	Mod+Enter overload branch.
-->
<section
	data-route="plan-review"
	data-stage="plan"
	data-plan-review-page
	data-state="populated"
	data-has-annotations={openAnnotationCount > 0}
	class="flex min-h-[40rem] flex-col gap-0 rounded-md border border-border bg-card"
>
	<!-- ── Review head — crumbs · plan title · waiting-input badge · mode-row ── -->
	<header
		data-slot="review-head"
		data-review-head
		class="flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-6 py-3.5"
	>
		<Breadcrumb
			data-review-crumbs
			class="min-w-0"
			items={[
				{ label: "plan", href: "/plan-session" },
				{ label: "reviews", href: "/plan-review" },
				{ label: PLAN_ID, current: true },
			]}
		/>
		<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
			<h1 class="truncate text-lg font-semibold tracking-tight text-foreground">
				{PLAN_TITLE}
			</h1>
			<!--
				COPY.md §6 canonical 8-state vocab — `waiting-input` is the canonical
				status for a review awaiting reviewer input. The ui-kit `StatusBadge`
				renders the locked vocab; `data-status="waiting-input"` is the verbatim
				canonical token (copy_assertion 2). `hideLabel` keeps the visible badge
				to the raw `waiting-input` token, matching OD `plan-review.html`.
			-->
			<span class="inline-flex items-center gap-1.5">
				<StatusBadge status="waiting-input" hideLabel data-review-status-badge />
				<span class="font-mono text-xs text-warning-foreground" data-review-status-label>
					waiting-input
				</span>
			</span>
		</div>
		<TraceChip traceId={TRACE_ID} />
		<!--
			The universal per-Step mode affordance (DESIGN.md §4.13,
			`prd-web-mode-affordance-system`) — Manual / Play / Discuss / AI Assist.
		-->
		<ModeRow bind:value={reviewMode} ariaLabel="Step mode" data-review-mode-row />
	</header>

	<!-- ── Tab bar — Plan & prototype · Comments · Free chat · History ──────── -->
	<Tabs bind:value={activeTab} class="flex min-h-0 flex-1 flex-col gap-0">
		<TabsList
			data-review-tabs
			class="flex w-full flex-wrap justify-start gap-1 rounded-none border-b border-border bg-muted/30 px-3 py-2"
		>
			<TabsTrigger value="content" data-review-tab="content" class="gap-1.5">
				Plan &amp; prototype
				<Badge variant="outline" class="font-mono text-[10px]">{planSectionCount} sections</Badge>
			</TabsTrigger>
			<TabsTrigger value="comments" data-review-tab="comments" class="gap-1.5">
				Comments
				<Badge variant="outline" class="font-mono text-[10px]">{threadCount}</Badge>
			</TabsTrigger>
			<TabsTrigger value="chat" data-review-tab="chat" class="gap-1.5">
				Free chat
				<Badge variant="outline" class="font-mono text-[10px]">{chatCount}</Badge>
			</TabsTrigger>
			<TabsTrigger value="history" data-review-tab="history" class="gap-1.5">
				History
				<Badge variant="outline" class="font-mono text-[10px]">{revisionCount}</Badge>
			</TabsTrigger>
		</TabsList>

		<!-- ── Panel: Plan & prototype — the three-pane tripane ──────────────── -->
		<TabsContent
			value="content"
			data-review-panel="content"
			class="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[1.1fr_1fr_380px]"
		>
			<!-- Pane 1 — plan markdown with inline-commentable sections. -->
			<div
				data-slot="plan-pane"
				data-plan-pane
				class="flex min-w-0 flex-col overflow-y-auto border-b border-border lg:border-r lg:border-b-0"
			>
				<div
					class="sticky top-0 z-[2] flex items-center gap-2.5 border-b border-border bg-muted/30 px-4 py-2.5"
				>
					<span class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
						Plan
					</span>
					<span class="flex-1"></span>
					<span class="font-mono text-[10px] text-muted-foreground">{planSectionCount} sections</span>
					<Button variant="ghost" size="sm" data-plan-edit>Edit</Button>
				</div>
				<div class="grid max-w-2xl gap-1 px-6 py-5 text-sm leading-relaxed">
					{#each PLAN_SECTIONS as section (section.anchor)}
						{#if section.kind === "callout"}
							<!--
								The Risk callout — DESIGN.md §4.5 tool-call card register. Still
								an inline-commentable anchor (interaction_assertion 1).
							-->
							<div
								data-commentable={section.anchor}
								data-comments={section.comments || undefined}
								class="my-3 flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3.5"
							>
								<span aria-hidden="true" class="text-warning-foreground">⚠</span>
								<div class="min-w-0">
									<strong class="block text-sm font-semibold text-warning-foreground">
										{section.heading}
									</strong>
									{#each section.body.items as line (line)}
										<p class="mt-0.5 text-sm leading-6 text-foreground">{line}</p>
									{/each}
								</div>
								{#if section.comments > 0}
									<Chip tone="accent" class="shrink-0 font-mono text-[10px]">
										{section.comments}
									</Chip>
								{/if}
							</div>
						{:else}
							<section data-commentable={section.anchor} data-comments={section.comments || undefined}>
								<div class="flex items-center gap-2">
									{#if section.kind === "references"}
										<h3
											class="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
										>
											{section.heading}
										</h3>
									{:else}
										<h2 class="mt-5 text-xl font-semibold tracking-tight text-foreground">
											{section.heading}
										</h2>
									{/if}
									{#if section.comments > 0}
										<Chip tone="accent" class="mt-3 font-mono text-[10px]">
											{section.comments}
										</Chip>
									{/if}
								</div>
								{#if section.body.type === "p"}
									{#each section.body.items as line (line)}
										<p class="my-2 leading-6 text-foreground">{line}</p>
									{/each}
								{:else if section.body.type === "ol"}
									<ol class="my-2 list-decimal pl-6">
										{#each section.body.items as item, index (index)}
											<li
												class="my-1 leading-6 text-foreground"
												data-commentable={section.anchor === "plan-approach"
													? `plan-step-${index + 1}`
													: undefined}
											>
												{item}
											</li>
										{/each}
									</ol>
								{:else}
									<ul class="my-2 list-disc pl-6">
										{#each section.body.items as item (item)}
											<li class="my-1 leading-6 text-foreground">{item}</li>
										{/each}
									</ul>
								{/if}
							</section>
						{/if}
					{/each}
				</div>
			</div>

			<!-- Pane 2 — embedded prototype callout (a live device frame). -->
			<div
				data-slot="prototype-pane"
				data-prototype-pane
				class="flex min-w-0 flex-col overflow-y-auto border-b border-border lg:border-r lg:border-b-0"
			>
				<div
					class="sticky top-0 z-[2] flex items-center gap-2.5 border-b border-border bg-muted/30 px-4 py-2.5"
				>
					<span class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
						Prototype callout
					</span>
					<span class="flex-1"></span>
					<span class="font-mono text-[10px] text-muted-foreground">/sessions UI · 360px column</span>
				</div>
				<div class="p-4" data-commentable="proto-sessions" data-comments="1">
					<Card class="overflow-hidden p-0" data-prototype-device>
						<div
							class="flex items-center gap-2 border-b border-border bg-muted px-3 py-2 font-mono text-xs text-muted-foreground"
						>
							<span class="size-2.5 rounded-full bg-destructive/70"></span>
							<span class="size-2.5 rounded-full bg-warning/70"></span>
							<span class="size-2.5 rounded-full bg-success/70"></span>
							<span class="ml-2">app.fulcrum.dev/settings/sessions</span>
						</div>
						<div class="bg-muted/40 p-4">
							<div
								class="mx-auto max-w-sm rounded-md border border-border bg-card p-4"
							>
								<div class="mb-3.5 flex items-center gap-2 text-sm font-semibold text-foreground">
									<span aria-hidden="true" class="text-accent">◍</span>
									Active sessions
								</div>
								<div class="overflow-hidden rounded-sm border border-border">
									{#each PROTOTYPE_DEVICES as row (row.device)}
										<div
											data-prototype-device-row
											data-current={row.current ? "true" : undefined}
											class="grid grid-cols-[1fr_auto] items-center gap-2.5 border-b border-border px-3 py-2.5 text-sm last:border-b-0 {row.current
												? 'bg-accent/10'
												: ''}"
										>
											<div class="min-w-0">
												<div class="flex items-center gap-1.5 text-foreground">
													<span class="truncate">{row.device}</span>
													{#if row.current}
														<Badge variant="outline" class="text-[10px]">this device</Badge>
													{/if}
												</div>
												<div class="mt-0.5 font-mono text-[10px] text-muted-foreground">
													{row.where}
												</div>
											</div>
											{#if row.action.tone === "disabled"}
												<Button variant="outline" size="sm" disabled>{row.action.label}</Button>
											{:else if row.action.tone === "destructive"}
												<Button variant="destructive" size="sm">{row.action.label}</Button>
											{:else}
												<Button variant={row.action.tone} size="sm">{row.action.label}</Button>
											{/if}
										</div>
									{/each}
								</div>
								<p class="mt-3.5 text-[11px] text-muted-foreground">
									Revoking signs out only that device. You stay signed in here.
								</p>
							</div>
						</div>
					</Card>
					<p
						class="mt-3.5 rounded-sm bg-muted px-2 py-2 text-center font-mono text-[11px] text-muted-foreground"
					>
						Hover device rows · Revoke buttons are wired (no-op) · production adds a confirm step
					</p>
				</div>
			</div>

			<!-- Pane 3 — task breakdown with per-task comment anchors. -->
			<div
				data-slot="tasks-pane"
				data-tasks-pane
				class="flex min-w-0 flex-col overflow-y-auto"
			>
				<div
					class="sticky top-0 z-[2] flex items-center gap-2.5 border-b border-border bg-muted/30 px-4 py-2.5"
				>
					<span class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
						Tasks
					</span>
					<span class="font-mono text-[10px] text-muted-foreground">{taskCount}</span>
					<span class="flex-1"></span>
					<Button variant="ghost" size="sm" data-task-add>Add</Button>
				</div>
				<ul class="grid gap-2.5 p-4" data-task-cards>
					{#each PLAN_TASKS as task (task.anchor)}
						<li>
							<Card
								data-commentable={task.anchor}
								data-comments={task.comments || undefined}
								data-task-card={task.anchor}
								data-has-thread={task.comments > 0 ? "true" : undefined}
								class="grid gap-2 p-3.5 {task.comments > 0 ? 'border-accent' : ''}"
							>
								<div class="flex items-center gap-2">
									<StatusBadge status={task.status} />
									<span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
										{task.title}
									</span>
									<ModeRow density="tight" ariaLabel="Step modes" data-task-mode-row />
								</div>
								<div class="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
									<span class="text-foreground">{task.agent}</span>
									<span>·</span>
									<span>{task.estimate}</span>
									<span>·</span>
									<span>{task.scope}</span>
									{#if task.comments > 0}
										<Chip tone="accent" class="ml-auto text-[10px]">{task.comments} threads</Chip>
									{/if}
								</div>
							</Card>
						</li>
					{/each}
				</ul>
			</div>
		</TabsContent>

		<!-- ── Panel: Comments — all threads anchored across plan/proto/tasks ── -->
		<TabsContent
			value="comments"
			data-review-panel="comments"
			class="min-h-0 flex-1 overflow-y-auto"
		>
			<div
				class="sticky top-0 z-[2] flex items-center gap-2.5 border-b border-border bg-muted/30 px-6 py-2.5"
			>
				<span class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
					All threads
				</span>
				<span class="font-mono text-[10px] text-muted-foreground">
					{threadCount} threads · {totalComments} comments
				</span>
			</div>
			<div class="grid gap-3 p-4" data-review-threads>
				{#each REVIEW_THREADS as thread (thread.anchor)}
					<Card
						data-review-thread={thread.anchor}
						data-resolved={isOpen(thread.anchor) ? undefined : "true"}
						class="grid gap-2.5 p-4"
					>
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-sm font-semibold text-foreground">{thread.label}</span>
							<Chip tone="neutral" class="font-mono text-[10px]" data-anchor-chip={thread.anchor}>
								{thread.anchor}
							</Chip>
							<span class="flex-1"></span>
							{#if isOpen(thread.anchor)}
								<Button
									variant="ghost"
									size="sm"
									data-resolve-thread={thread.anchor}
									onclick={() => resolveThread(thread.anchor)}
								>
									Resolve
								</Button>
							{:else}
								<Badge variant="outline">resolved</Badge>
							{/if}
						</div>
						{#each thread.comments as comment, index (index)}
							<div class="grid grid-cols-[2rem_minmax(0,1fr)] gap-2.5">
								<span
									class="flex size-8 items-center justify-center rounded-full text-[10px] font-semibold {comment.role ===
									'agent'
										? 'bg-accent/15 text-accent-foreground'
										: 'bg-muted text-muted-foreground'}"
								>
									{comment.role === "agent" ? "AI" : comment.author.slice(0, 2).toLowerCase()}
								</span>
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
										<strong class="text-foreground">{comment.author}</strong>
										<span>{comment.at}</span>
										{#if comment.pill}
											<StatusBadge status={comment.pill.status} class="ml-1" />
										{/if}
									</div>
									<p class="mt-1 text-sm leading-6 text-foreground">{comment.text}</p>
								</div>
							</div>
						{/each}
					</Card>
				{/each}
			</div>
		</TabsContent>

		<!-- ── Panel: Free chat — reviewers + AI in one stream ───────────────── -->
		<TabsContent
			value="chat"
			data-review-panel="chat"
			class="flex min-h-0 flex-1 flex-col"
		>
			<div
				class="sticky top-0 z-[2] flex items-center gap-2.5 border-b border-border bg-muted/30 px-6 py-2.5"
			>
				<span class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
					Free chat · plan reviewers + AI
				</span>
			</div>
			<div class="flex flex-1 flex-col gap-3 overflow-y-auto p-4" data-chat-stream>
				{#each CHAT_MESSAGES as message, index (index)}
					<div class="grid grid-cols-[2rem_minmax(0,1fr)] gap-2.5">
						<span
							class="flex size-8 items-center justify-center rounded-full text-[10px] font-semibold {message.role ===
							'agent'
								? 'bg-accent/15 text-accent-foreground'
								: 'bg-muted text-muted-foreground'}"
						>
							{message.role === "agent" ? "AI" : message.author.slice(0, 2).toLowerCase()}
						</span>
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
								<strong class="text-foreground">{message.author}</strong>
								<span>{message.at}</span>
								{#if message.pill}
									<StatusBadge status={message.pill.status} class="ml-1" />
								{/if}
							</div>
							<p class="mt-1 text-sm leading-6 text-foreground">{message.text}</p>
						</div>
					</div>
				{/each}
			</div>
			<form
				class="grid gap-2 border-t border-border bg-muted/30 p-4"
				data-chat-composer
				onsubmit={(event) => {
					event.preventDefault();
					chatDraft = "";
				}}
			>
				<Textarea
					bind:value={chatDraft}
					data-chat-input
					placeholder="Talk to plan reviewers and the AI together — @ to mention, / for slash commands"
					class="min-h-14 text-sm leading-6"
				/>
				<div class="flex flex-wrap items-center gap-2">
					<Button type="button" variant="ghost" size="sm">Mention</Button>
					<Button type="button" variant="ghost" size="sm">Attach</Button>
					<Button type="button" variant="ghost" size="sm">Command</Button>
					<span class="flex-1"></span>
					<Button type="button" variant="ghost" size="sm">Ask AI</Button>
					<Button type="submit" size="sm" data-chat-send class="gap-1.5">
						Send <Kbd>⌘↵</Kbd>
					</Button>
				</div>
			</form>
		</TabsContent>

		<!-- ── Panel: History — plan revisions with diff counts ──────────────── -->
		<TabsContent
			value="history"
			data-review-panel="history"
			class="min-h-0 flex-1 overflow-y-auto"
		>
			<div
				class="sticky top-0 z-[2] flex items-center gap-2.5 border-b border-border bg-muted/30 px-6 py-2.5"
			>
				<span class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
					Plan history
				</span>
				<span class="font-mono text-[10px] text-muted-foreground">{revisionCount} revisions</span>
			</div>
			<div class="grid gap-4 p-6" data-plan-revisions>
				{#each PLAN_REVISIONS as revision (revision.label)}
					<div class="grid grid-cols-[2rem_minmax(0,1fr)] gap-2.5" data-plan-revision={revision.label}>
						<span
							class="flex size-8 items-center justify-center rounded-full text-[10px] font-semibold {revision.role ===
							'agent'
								? 'bg-accent/15 text-accent-foreground'
								: 'bg-muted text-muted-foreground'}"
						>
							{revision.role === "agent" ? "AI" : "mk"}
						</span>
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
								<strong class="text-foreground">{revision.label}</strong>
								<span>{revision.at}</span>
								<span>·</span>
								<span>{revision.source}</span>
							</div>
							<p class="mt-1 text-sm leading-6 text-foreground">{revision.summary}</p>
							<div class="mt-1.5 flex items-center gap-2">
								<code class="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
									{revision.diff}
								</code>
								<Button variant="ghost" size="sm">View diff</Button>
								<Button variant="ghost" size="sm">Roll back</Button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</TabsContent>
	</Tabs>

	<!-- ── Request-changes bar — inline, opens above the gate (OD lines 622-628) ── -->
	{#if requestChangesOpen}
		<div
			data-request-changes-bar
			class="mx-4 mb-3 flex flex-wrap items-center gap-2.5 rounded-md border border-dashed border-warning bg-warning/10 px-3 py-2.5 text-sm text-foreground"
		>
			<span aria-hidden="true" class="text-warning-foreground">⚠</span>
			<strong class="text-warning-foreground">Request changes</strong>
			<span class="flex-1">
				{openAnnotationCount} thread{openAnnotationCount === 1 ? "" : "s"} still open — reviewers will be
				notified once you submit.
			</span>
			<Textarea
				bind:value={requestChangesNote}
				data-request-changes-note
				placeholder="What needs to change before this can be approved?"
				class="min-h-9 w-full text-sm"
			/>
			<Button variant="ghost" size="sm" onclick={() => (requestChangesOpen = false)}>Cancel</Button>
			<Button size="sm" data-submit-request-changes onclick={submitRequestChanges}>
				Submit review
			</Button>
		</div>
	{/if}

	<!-- ── Bottom gate — the single approve gate for plan + prototype + tasks ── -->
	<footer
		data-slot="review-gate"
		data-review-gate
		class="flex flex-wrap items-center gap-3.5 border-t border-border bg-muted/30 px-6 py-3.5"
	>
		<p class="min-w-0 flex-1 text-sm text-muted-foreground" data-gate-summary>
			Reviewed by <b class="text-foreground">mk</b> · plan + {taskCount} tasks + 1 prototype callout ·
			<b class="text-foreground">{threadCount} inline threads</b>, {openAnnotationCount} unresolved.
		</p>

		{#if gateOutcome}
			<!--
				The gate outcome — proves the Mod+Enter overload branch taken
				(interaction_assertion 2 / copy_assertion 1).
			-->
			<span
				data-gate-outcome={gateOutcome}
				class="rounded-md px-2.5 py-1 text-xs font-medium {gateOutcome === 'approved'
					? 'bg-success/15 text-success'
					: gateOutcome === 'changes-requested'
						? 'bg-warning/20 text-warning-foreground'
						: 'bg-accent/15 text-accent-foreground'}"
			>
				{#if gateOutcome === "approved"}
					Approved — promoted to Build
				{:else if gateOutcome === "feedback-sent"}
					Feedback sent to the planning agent
				{:else if gateOutcome === "saved"}
					Saved — not promoted
				{:else}
					Changes requested
				{/if}
			</span>
		{/if}

		<Button variant="ghost" data-request-changes-toggle onclick={openRequestChanges}>
			Request changes
		</Button>
		{#if openAnnotationCount === 0}
			<Button variant="outline" data-reopen-threads onclick={reopenAllThreads}>
				Re-open threads
			</Button>
		{/if}
		<Button variant="outline" data-save-without-promoting onclick={saveWithoutPromoting}>
			Save without promoting
		</Button>
		<!--
			The Plannotator `Mod+Enter` overload (COPY.md §539 / IA-MAP.md §2.2):
			one control approves the plan + prototype + tasks as a unit when there
			are zero annotations, and sends feedback when annotations exist. The
			`⌘↵` chord (window `onkeydown`) triggers the identical branch. The
			button label tracks the live branch so the overload is legible.
		-->
		<Button
			size="lg"
			data-approve-gate
			data-overload-branch={willApprove ? "approve" : "send-feedback"}
			class="gap-1.5"
			onclick={submitGate}
		>
			{#if willApprove}
				Approve &amp; promote to Build
			{:else}
				Send feedback ({openAnnotationCount})
			{/if}
			<Kbd>⌘↵</Kbd>
		</Button>
	</footer>
</section>
