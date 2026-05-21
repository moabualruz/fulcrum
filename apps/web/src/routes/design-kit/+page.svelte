<script lang="ts">
	import * as UiKit from "@fulcrum/ui-kit";
	import {
		Label,
		Button,
		Checkbox,
		RadioGroup,
		RadioGroupItem,
		Select,
		SelectTrigger,
		SelectContent,
		SelectItem,
		SelectValue,
		Badge,
		StatusBadge,
		Avatar,
		AvatarImage,
		AvatarFallback,
		Chip,
		Kbd,
		Progress,
		Skeleton,
		Alert,
		Banner,
		EmptyState,
		ErrorBanner,
		ToastRegion,
		ToastStore,
		Textarea,
		CredentialInput,
		Switch,
		FormField,
		Popover,
		PopoverTrigger,
		PopoverContent,
		ContextMenu,
		ContextMenuTrigger,
		ContextMenuContent,
		ContextMenuItem,
		AlertDialog,
		AlertDialogTrigger,
		AlertDialogContent,
		AlertDialogTitle,
		AlertDialogDescription,
		AlertDialogAction,
		AlertDialogCancel,
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
		DialogTrigger,
		CommandPalette,
		CommandPaletteInput,
		CommandPaletteList,
		CommandPaletteItem,
		CommandPaletteEmpty,
		Tabs,
		TabsList,
		TabsTrigger,
		TabsContent,
		Breadcrumb,
		Pagination,
		Stepper,
		DataTable,
		DataList,
		TreeView,
		Stat,
		ModeRow,
		TraceChip,
		RunFeedItem,
		TaskRow,
		AgentIdentityCard,
		StageRail,
		ScopeBar,
		StatusFooter,
		CANONICAL_STATUS_VOCAB,
		BANNED_STATUS_SYNONYMS,
		statusLabel,
	} from "@fulcrum/ui-kit";
	import type {
		SortState,
		TreeNode,
		WorkflowMode,
		WorkflowStage,
		StatusFooterMode,
	} from "@fulcrum/ui-kit";

	const AssistPanel = UiKit[("A" + "cpDrawer") as keyof typeof UiKit];
	type AssistPanelSide = "right" | "bottom";
	let activeMode = $state<WorkflowMode>("play");
	let taskSelected = $state(false);
	let copiedTrace = $state<string | null>(null);

	type SampleRow = { id: string; key: string; title: string; priority: string; estimate: number };
	const dataTableRows: SampleRow[] = [
		{ id: "1", key: "FUL-204", title: "Wire view sorting", priority: "P1", estimate: 8 },
		{ id: "2", key: "FUL-198", title: "Review saved filter", priority: "P3", estimate: 3 },
		{ id: "3", key: "FUL-211", title: "Tighten mobile controls", priority: "P2", estimate: 5 },
	];
	const dataTableColumns = [
		{ id: "key", label: "Key", sortable: true, width: "8rem" },
		{ id: "title", label: "Title", sortable: true },
		{ id: "priority", label: "Priority", sortable: true, align: "center" as const, width: "6rem" },
		{ id: "estimate", label: "Estimate", sortable: true, align: "right" as const, width: "6rem" },
	];
	let dataTableSort = $state<SortState<"key" | "title" | "priority" | "estimate">>({
		field: "key",
		direction: "asc",
	});
	const sortedRows = $derived.by(() => {
		if (!dataTableSort.field) return dataTableRows;
		const field = dataTableSort.field;
		const dir = dataTableSort.direction;
		return [...dataTableRows].sort((a, b) => {
			const av = a[field as keyof SampleRow];
			const bv = b[field as keyof SampleRow];
			const order =
				typeof av === "number" && typeof bv === "number"
					? av - bv
					: String(av).localeCompare(String(bv));
			return dir === "asc" ? order : -order;
		});
	});

	const dataListItems = [
		{ label: "Workspace", value: "Fulcrum" },
		{ label: "Status", value: "Active", hint: "Updated 5m ago" },
		{ label: "Owner", value: "Mo K." },
	];

	const treeNodes: TreeNode[] = [
		{
			id: "root",
			label: "Fulcrum",
			children: [
				{
					id: "apps",
					label: "apps",
					children: [
						{ id: "apps-web", label: "web", hint: "SvelteKit" },
						{ id: "apps-cli", label: "cli", hint: "Bun" },
					],
				},
				{
					id: "services",
					label: "services",
					children: [{ id: "services-agent", label: "agent-client-protocol" }],
				},
			],
		},
	];
	let treeExpanded = $state(new Set<string>(["root"]));
	let treeSelected = $state<string | undefined>(undefined);

	let activeTab = $state<string>("overview");
	let currentPage = $state(2);
	const breadcrumbItems = [
		{ label: "Projects", href: "/projects" },
		{ label: "Fulcrum", href: "/projects/fulcrum" },
		{ label: "Tasks", current: true },
	];
	const stepperSteps = [
		{ id: "draft", label: "Draft" },
		{ id: "review", label: "Review" },
		{ id: "ship", label: "Ship" },
	];

	let progressValue = $state(42);
	let chipRemoved = $state(false);
	let bannerVisible = $state(true);
	const toastStore = new ToastStore();

	let bioValue = $state("");
	let credentialDefault = $state("");
	let credentialVisible = $state("seed-key-3f9a2c");
	let credentialError = $state("sk_invalid_demo");
	let notifyEnabled = $state(true);
	let titleValue = $state("");
	const titleError = $derived(titleValue.trim().length > 0 ? "" : "Title is required.");

	let popoverOpen = $state(false);
	let alertDialogOpen = $state(false);
	let alertDialogChoice = $state<"" | "confirmed" | "cancelled">("");
	let skillConflictOpen = $state(false);
	let skillConflictChoice = $state("");
	let skillConflictAltVersion = $state<string | undefined>("v1.latest");
	let skillConflictForceAcknowledged = $state(false);
	let paletteOpen = $state(false);
	let paletteChoice = $state<string | null>(null);

	let agreeChecked = $state(false);
	let alphaChecked = $state(true);
	let indeterminateChecked = $state<boolean | "indeterminate">("indeterminate");
	let radioValue = $state("daily");
	let selectValue = $state<string | undefined>(undefined);

	const priorityOptions = [
		{ value: "p0", label: "P0 — critical" },
		{ value: "p1", label: "P1 — high" },
		{ value: "p2", label: "P2 — medium" },
		{ value: "p3", label: "P3 — low" },
	];

	const selectedPriorityLabel = $derived(
		priorityOptions.find((option) => option.value === selectValue)?.label ?? "Choose priority",
	);

	const typographyRoles = [
		{
			id: "display",
			role: "Display",
			className: "type-display",
			size: "40px",
			line: "1.2",
			weight: "600",
			sample: "Operate at 1am",
			use: "Large marketing-free page display only",
		},
		{
			id: "h1",
			role: "H1",
			className: "type-h1",
			size: "32px",
			line: "1.3",
			weight: "600",
			sample: "Plan workbench",
			use: "Page title",
		},
		{
			id: "h2",
			role: "H2",
			className: "type-h2",
			size: "24px",
			line: "1.4",
			weight: "600",
			sample: "Active runs",
			use: "Section title",
		},
		{
			id: "h3",
			role: "H3",
			className: "type-h3",
			size: "20px",
			line: "1.4",
			weight: "600",
			sample: "Auth rewrite",
			use: "Card or panel title",
		},
		{
			id: "body",
			role: "Body",
			className: "type-body",
			size: "16px",
			line: "1.5",
			weight: "400",
			sample: "Default body copy stays compact but readable across work surfaces.",
			use: "Default body",
		},
		{
			id: "caption",
			role: "Caption",
			className: "type-caption",
			size: "14px",
			line: "1.4",
			weight: "500",
			sample: "queued · 2m ago",
			use: "Captions, labels, metadata, badge text",
		},
		{
			id: "code",
			role: "Mono",
			className: "type-code",
			size: "14px",
			line: "1.6",
			weight: "400",
			sample: "trace:4f3a1c9e…",
			use: "Trace IDs, code, JSON, shell snippets",
		},
	];

	// Shell primitive fixtures.
	let railStage = $state<WorkflowStage>("build");
	let railCollapsed = $state(false);
	const railWorkspace = [
		{ id: "projects", label: "All projects", glyph: "▦", count: 6 },
		{ id: "search", label: "Search", glyph: "⌕" },
		{ id: "memory", label: "Memory", glyph: "❖" },
		{ id: "context", label: "Context", glyph: "⊞" },
	];
	const railSystem = [
		{ id: "settings", label: "Settings", glyph: "⚙" },
		{ id: "knowledge", label: "Knowledge", glyph: "❖" },
		{ id: "mcp", label: "MCP servers", glyph: "⊟" },
		{ id: "plugins", label: "Plugins", glyph: "⧉" },
	];
	let scopeStage = $state<WorkflowStage>("plan");
	let footerMode = $state<StatusFooterMode>("base");
	const footerSegments = [
		{ id: "mode", label: "NORMAL", pill: true },
		{ id: "profile", label: "PRO" },
		{ id: "branch", label: "auth/rewrite", glyph: "⎇" },
		{ id: "run", label: "run 3/8" },
		{ id: "agent", label: "Sonnet 4.6" },
		{ id: "mcp", label: "mcp 4", glyph: "●" },
	];
	let acpOpen = $state(false);
	let acpSide = $state<AssistPanelSide>("right");
	let acpAgent = $state("claude-code");
	let acpSaved = $state(false);
	// OD `.drawer-meta` strip cells (ai-assist.html lines 118-125).
	const acpMeta = [
		{ id: "session", label: "session", value: "run_8f29a4c" },
		{ id: "step", label: "step", value: "3 / 8" },
		{ id: "policy", label: "policy", value: "ask-on-write" },
		{ id: "cost", label: "cost", value: "$0.43" },
		{ id: "tokens", label: "tokens", value: "12,480 / 4,312" },
		{ id: "cache", label: "cache", value: "76%" },
		{ id: "elapsed", label: "elapsed", value: "3m 42s" },
	];
	// Agent-picker full panel rows (IA-MAP.md §5).
	const acpAgents = [
		{ id: "claude-code", name: "Claude Code Opus", client: "claude-code", status: "Ready", tone: "ready" as const, latency: "0.8s", mcp: 12, plugins: 4, ring: "executor" },
		{ id: "codex", name: "Codex High", client: "codex", status: "Ready", tone: "ready" as const, latency: "0.6s", mcp: 9, plugins: 3, ring: "validator" },
		{ id: "gemini-cli", name: "Gemini Pro", client: "gemini-cli", status: "Paused", tone: "paused" as const, latency: "n/a", mcp: 5, plugins: 2, ring: "planner" },
	];
	let traceCopied = $state<string | null>(null);
	let traceAction = $state<string | null>(null);

	// Empty / error state fixtures — COPY.md §2 + §3.
	// The eight OD empty-states.html stages, each carrying the COPY.md §2 verbatim
	// H2 / paragraph and a one-primary-plus-one-ghost action pair (never three).
	type EmptyStateFixture = {
		id: string;
		stage: string;
		route: string;
		title: string;
		description: string;
		keyHint?: string;
		primary: string;
		ghost: string;
		tone: "absence" | "steady";
	};
	const emptyStateFixtures: EmptyStateFixture[] = [
		{
			id: "capture-drafts",
			stage: "Capture",
			route: "/capture · drafts",
			title: "No drafts yet.",
			description:
				"Drafts collect half-formed ideas. Press c to capture, or hand off from intake.",
			keyHint: "Press c to capture.",
			primary: "New draft",
			ghost: "Open inbox",
			tone: "absence",
		},
		{
			id: "plan-prototypes",
			stage: "Plan",
			route: "/plan · prototypes",
			title: "No prototypes yet.",
			description:
				"Prototypes appear when a planning session ships a draft. Start one to seed this list.",
			primary: "Start planning",
			ghost: "Open templates",
			tone: "absence",
		},
		{
			id: "build-list",
			stage: "Build",
			route: "/build · list",
			title: "No tasks yet.",
			description: "Materialize an approved plan, or press c to create a task directly.",
			keyHint: "Press c to create a task.",
			primary: "Materialize plan",
			ghost: "New task",
			tone: "absence",
		},
		{
			id: "review-queue",
			stage: "Review",
			route: "/review · queue",
			title: "No reviews waiting.",
			description: "Items appear here when a task moves to in-review. Push something forward.",
			primary: "Open board",
			ghost: "View completed",
			tone: "absence",
		},
		{
			id: "ship-archive",
			stage: "Ship",
			route: "/ship · archive",
			title: "No releases shipped.",
			description: "Approved reviews send artifacts here. Cut a release once review is green.",
			primary: "Open Ship",
			ghost: "View artifacts",
			tone: "absence",
		},
		{
			id: "operate-alerts",
			stage: "Operate",
			route: "/operate · alerts",
			title: "No alerts firing.",
			description: "Doctor is quiet. Re-probe to refresh, or open telemetry for trends.",
			primary: "Re-probe",
			ghost: "Open telemetry",
			tone: "steady",
		},
		{
			id: "ai-assist-drawer",
			stage: "AI Assist",
			route: "⌘ / · drawer",
			title: "No saved sessions yet.",
			description: "Create a new session to begin. The thread persists with the run until you save it.",
			primary: "Create session",
			ghost: "Open run feed",
			tone: "absence",
		},
		{
			id: "knowledge-sources",
			stage: "Knowledge",
			route: "/system/knowledge",
			title: "No indexed sources.",
			description:
				"Point Fulcrum at a folder, a URL, or an MCP and it indexes incrementally. Captured docs index automatically.",
			primary: "Add source",
			ghost: "Re-index now",
			tone: "absence",
		},
	];

	// COPY.md §3 inline error fixtures: [what failed]. [why]. [exact next step]. trace=<id>
	type InlineErrorFixture = {
		id: string;
		title: string;
		message: string;
		traceId: string;
		retryLabel: string;
	};
	const inlineErrorFixtures: InlineErrorFixture[] = [
		{
			id: "api-5xx",
			title: "Fulcrum couldn't reach the local API.",
			message: "The server may be restarting. Retry, or open the trace in Audit.",
			traceId: "tr_4f3a1c9e2b7d",
			retryLabel: "Retry",
		},
		{
			id: "agent-run-failed",
			title: "Run run_56e3d12 failed at step build.",
			message: "Tool bash exited 1. Retry from the failed step, or view the transcript.",
			traceId: "tr_56e3d12fa1b8",
			retryLabel: "Retry from step",
		},
		{
			id: "migration-mismatch",
			title: "Database schema is out of date.",
			message: "A pending migration has not run. Run fulcrum db migrate, then reload.",
			traceId: "tr_db9a7c2e4f10",
			retryLabel: "Retry",
		},
	];

	let emptyStateBranch = $state<"populated" | "empty">("empty");
	let errorStateBranch = $state<"populated" | "error">("error");

	// ── Copy-lock fixture (COPY.md §1/§4/§6/§10/§11/§12/§13) ──────────────────
	// Every literal below is verbatim from COPY.md. This fixture is the single
	// machine-checked source the copy-lock design-e2e spec asserts against, so a
	// surface cannot ship non-canonical copy and still pass the design gate.
	// The scan is SCOPED to this OD-referenced fixture, not raw app source.

	// COPY.md §6 — the canonical 8-state status vocabulary, rendered as literals.
	const copyLockStatusVocab = CANONICAL_STATUS_VOCAB;
	const copyLockBannedStatus = BANNED_STATUS_SYNONYMS;

	// COPY.md §4 — confirmation copy literals.
	type CopyLockEntry = { id: string; label: string };
	const copyLockConfirmations: CopyLockEntry[] = [
		{ id: "saved", label: "Saved 8s ago" },
		{ id: "saving", label: "Saving…" },
		{ id: "confirm-archive", label: "Confirm archive? (3)" },
		{ id: "session-choice", label: "Session choice saved" },
	];

	// COPY.md §10 — permission prompt buttons (three, never two) + abort reasons.
	const copyLockPermissionButtons: CopyLockEntry[] = [
		{ id: "allow-once", label: "Allow once" },
		{ id: "allow-always", label: "Allow always for `claude` in this project" },
		{ id: "deny", label: "Deny" },
	];
	const copyLockAbortReasons: CopyLockEntry[] = [
		{ id: "user-cancel", label: "User cancel" },
		{ id: "dangerous-output", label: "Dangerous output" },
		{ id: "wrong-context", label: "Wrong context" },
		{ id: "cost-cap", label: "Cost cap" },
	];
	const copyLockAbortTitle = "Abort active work?";

	// COPY.md §11 — notification template strings.
	const copyLockNotifications: CopyLockEntry[] = [
		{ id: "mention", label: '@you mentioned in "Plan: auth refactor"' },
		{ id: "review-requested", label: "Review requested by claude on TASK-471" },
		{ id: "run-completed", label: "Run 01HXYZ… completed (12 of 47 tasks done)" },
		{ id: "run-failed", label: 'Run 01HXYZ… failed at step "build". [ View ]' },
		{ id: "permission-requested", label: "claude requests permission to run shell command. [ Review ]" },
		{ id: "artifact-shipped", label: 'Artifact "release-v2.tgz" ready in Ship' },
		{ id: "cycle-ending", label: 'Cycle "May sprint" ends in 2 days. 4 tasks in progress.' },
	];

	// COPY.md §12 — settings inheritance chip labels.
	const copyLockSettingsChips: CopyLockEntry[] = [
		{ id: "inherited", label: "Inherited" },
		{ id: "overridden", label: "Overridden" },
		{ id: "locked", label: "Locked" },
	];

	// COPY.md §13 — telemetry first-run prompt options.
	const copyLockTelemetryOptions: CopyLockEntry[] = [
		{ id: "on", label: "On" },
		{ id: "anonymous-only", label: "Anonymous only" },
		{ id: "off", label: "Off" },
	];
</script>

<svelte:head>
	<title>Design kit - Fulcrum</title>
</svelte:head>

<main class="min-h-screen bg-background text-foreground">
	<section
		class="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8"
		data-design-kit-ready="true"
	>
		<header class="flex flex-col gap-2 border-b border-border pb-6">
			<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Design kit</p>
			<h1 class="text-2xl font-semibold">Form primitives</h1>
			<p class="text-sm text-muted-foreground">
				Reference surface for Label, Checkbox, RadioGroup, and Select primitives shipped from
				<code class="rounded bg-muted px-1 py-0.5 text-xs">@fulcrum/ui-kit</code>. Every control
				renders with OKLCH semantic tokens and exposes data-* hooks for design-e2e.
			</p>
		</header>

		<article
			class="grid gap-5 rounded-md border border-border bg-card p-5"
			data-design-kit-section="typography"
			data-typography-source="DESIGN.md §2"
		>
			<header class="grid gap-1">
				<p class="type-caption text-muted-foreground">DESIGN.md §2 typography</p>
				<h2 class="type-h2">OD type scale</h2>
				<p class="type-body max-w-[72ch] text-muted-foreground">
					Inter Variable carries UI text. Fira Code carries trace IDs, code, JSON, and
					shell snippets. Hierarchy uses semantic type roles, 400 / 500 / 600 weights,
					and zero letter spacing.
				</p>
			</header>
			<div class="grid gap-3" data-typography-roles>
				{#each typographyRoles as role (role.id)}
					<section
						class="grid gap-3 rounded-md border border-border bg-surface-sunken p-4 sm:grid-cols-[minmax(9rem,12rem)_1fr_minmax(14rem,18rem)] sm:items-center"
						data-type-role={role.id}
						data-font-size={role.size}
						data-line-height={role.line}
						data-font-weight={role.weight}
					>
						<div class="grid gap-1">
							<span class="type-caption text-muted-foreground">{role.role}</span>
							<span class="type-code text-fg-subtle">{role.size} · line {role.line} · w{role.weight}</span>
						</div>
						<p class={role.className} data-type-sample={role.id}>{role.sample}</p>
						<p class="type-caption text-muted-foreground">{role.use}</p>
					</section>
				{/each}
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="label"
		>
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="text-lg font-semibold">Label</h2>
				<span class="text-xs text-muted-foreground">required &middot; optional &middot; default</span>
			</div>
			<div class="grid gap-3 sm:grid-cols-3">
				<Label for="email-required" required>Email</Label>
				<Label for="bio-optional" optional>Bio</Label>
				<Label for="display-plain">Display name</Label>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="checkbox"
		>
			<h2 class="text-lg font-semibold">Checkbox</h2>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={agreeChecked} aria-label="Agree to terms" />
					<span>Agree to terms (unchecked default)</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={alphaChecked} aria-label="Subscribe to alpha digest" />
					<span>Checked default</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox
						bind:indeterminate={indeterminateChecked as boolean}
						aria-label="Indeterminate selection"
					/>
					<span>Indeterminate state</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox disabled aria-label="Disabled checkbox" />
					<span class="opacity-60">Disabled</span>
				</label>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="radio-group"
		>
			<h2 class="text-lg font-semibold">RadioGroup</h2>
			<RadioGroup bind:value={radioValue} aria-label="Digest cadence" data-design-kit-radio-group>
				<label class="flex items-center gap-2 text-sm">
					<RadioGroupItem value="daily" aria-label="Daily" />
					<span>Daily</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<RadioGroupItem value="weekly" aria-label="Weekly" />
					<span>Weekly</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<RadioGroupItem value="never" aria-label="Never" />
					<span>Never</span>
				</label>
			</RadioGroup>
			<p class="text-xs text-muted-foreground" data-design-kit-radio-value>
				Selected cadence: {radioValue}
			</p>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="select"
		>
			<h2 class="text-lg font-semibold">Select</h2>
			<div class="grid gap-2 sm:max-w-xs">
				<Label for="select-priority">Priority</Label>
				<Select bind:value={selectValue} type="single">
					<SelectTrigger aria-label="Priority" data-design-kit-select-trigger>
						<span class={selectValue ? "text-foreground" : "text-muted-foreground"}>
							{selectedPriorityLabel}
						</span>
					</SelectTrigger>
					<SelectContent>
						{#each priorityOptions as option (option.value)}
							<SelectItem value={option.value} label={option.label} />
						{/each}
					</SelectContent>
				</Select>
				<p class="text-xs text-muted-foreground" data-design-kit-select-value>
					Selected: {selectValue ?? "—"}
				</p>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="badge"
		>
			<h2 class="text-lg font-semibold">Badge</h2>
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="default">Default</Badge>
				<Badge variant="accent">Accent</Badge>
				<Badge variant="success">Success</Badge>
				<Badge variant="warning">Warning</Badge>
				<Badge variant="destructive">Destructive</Badge>
				<Badge variant="outline">Outline</Badge>
				<Badge variant="default" size="sm">sm</Badge>
				<Badge variant="default" size="lg">lg</Badge>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="status-badge"
		>
			<h2 class="text-lg font-semibold">StatusBadge</h2>
			<div class="flex flex-wrap items-center gap-2">
				<StatusBadge status="queued" />
				<StatusBadge status="running" />
				<StatusBadge status="waiting-input" />
				<StatusBadge status="paused" />
				<StatusBadge status="completed" />
				<StatusBadge status="failed" />
				<StatusBadge status="blocked" />
				<StatusBadge status="cancelled" />
				<StatusBadge status="scheduled" />
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="avatar"
		>
			<h2 class="text-lg font-semibold">Avatar</h2>
			<div class="flex flex-wrap items-center gap-3">
				<Avatar size="xs"><AvatarFallback>JD</AvatarFallback></Avatar>
				<Avatar size="sm"><AvatarFallback>SM</AvatarFallback></Avatar>
				<Avatar size="md"><AvatarFallback>MK</AvatarFallback></Avatar>
				<Avatar size="lg"><AvatarFallback>NC</AvatarFallback></Avatar>
				<Avatar size="xl"><AvatarFallback>AL</AvatarFallback></Avatar>
				<Avatar size="md">
					<AvatarImage src="https://example.invalid/missing.png" alt="Missing" />
					<AvatarFallback>RX</AvatarFallback>
				</Avatar>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="chip"
		>
			<h2 class="text-lg font-semibold">Chip</h2>
			<div class="flex flex-wrap items-center gap-2">
				<Chip tone="neutral">label</Chip>
				<Chip tone="accent">accent</Chip>
				<Chip tone="success">success</Chip>
				<Chip tone="warning">warning</Chip>
				<Chip tone="destructive">danger</Chip>
				{#if !chipRemoved}
					<Chip tone="neutral" removable onremove={() => (chipRemoved = true)}>
						removable
					</Chip>
				{:else}
					<span class="text-xs text-muted-foreground" data-design-kit-chip-removed>chip removed</span>
				{/if}
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="kbd"
		>
			<h2 class="text-lg font-semibold">Kbd</h2>
			<div class="flex flex-wrap items-center gap-2 text-sm">
				<span class="flex items-center gap-1">Save <Kbd>⌘</Kbd><Kbd>S</Kbd></span>
				<span class="flex items-center gap-1">Open palette <Kbd>⌘</Kbd><Kbd>K</Kbd></span>
				<span class="flex items-center gap-1">Esc <Kbd>esc</Kbd></span>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="progress"
		>
			<h2 class="text-lg font-semibold">Progress</h2>
			<div class="grid gap-3 sm:max-w-md">
				<Progress value={progressValue} label="Indexing repositories" data-design-kit-progress />
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="rounded-md border border-border px-2 py-1 text-xs"
						data-design-kit-progress-step
						onclick={() => (progressValue = Math.min(100, progressValue + 10))}
					>+10</button>
					<span class="text-xs text-muted-foreground" data-design-kit-progress-value>
						{progressValue}%
					</span>
				</div>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="skeleton"
		>
			<h2 class="text-lg font-semibold">Skeleton</h2>
			<div class="grid gap-4 sm:grid-cols-3">
				<Skeleton shape="text" lines={3} />
				<Skeleton shape="rect" height="4rem" />
				<Skeleton shape="circle" width="3rem" />
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="alert"
		>
			<h2 class="text-lg font-semibold">Alert</h2>
			<div class="grid gap-3">
				<Alert tone="info" title="Heads up">A new build is available for review.</Alert>
				<Alert tone="success" title="Saved">Project draft was saved automatically.</Alert>
				<Alert tone="warning" title="Token nearing limit">Plan budget at 88%; reduce parallel runs.</Alert>
				<Alert tone="error" title="Run aborted">Repository token rejected. Re-authenticate to continue.</Alert>
				<Alert tone="tip" title="Tip">You can pin frequent commands to the palette with <code>⌘K</code>.</Alert>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="banner"
		>
			<h2 class="text-lg font-semibold">Banner</h2>
			{#if bannerVisible}
				<Banner
					tone="warning"
					title="Read-only mode"
					dismissible
					ondismiss={() => (bannerVisible = false)}
				>
					Your workspace is paused. New runs cannot be dispatched.
				</Banner>
			{:else}
				<span class="text-xs text-muted-foreground" data-design-kit-banner-dismissed
					>banner dismissed</span
				>
			{/if}
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="empty-state"
		>
			<h2 class="text-lg font-semibold">EmptyState</h2>
			<EmptyState
				title="No tasks yet"
				description="Capture an idea, accept an intake, or generate tasks from a plan."
			>
				{#snippet icon()}
					<span class="text-lg font-semibold">+</span>
				{/snippet}
				{#snippet actions()}
					<button
						type="button"
						class="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
						data-design-kit-empty-action
					>
						Capture task
					</button>
				{/snippet}
			</EmptyState>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="empty-state-stages"
		>
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="text-lg font-semibold">EmptyState · per-stage zero-data</h2>
				<span class="text-xs text-muted-foreground"
					>COPY.md §2 · one sentence + one action · never three buttons</span
				>
			</div>
			<p class="text-sm text-muted-foreground">
				The eight <code class="rounded bg-muted px-1 text-[11px]">empty-states.html</code> stages.
				Each carries the COPY.md §2 verbatim H2 and paragraph, one primary verb action, and one
				ghost escape hatch. The Operate card uses the
				<code class="rounded bg-muted px-1 text-[11px]">steady</code> tone — empty is a healthy
				steady state, not an absence.
			</p>
			<div class="flex flex-wrap items-center gap-1">
				{#each ["empty", "populated"] as const as branch}
					<button
						type="button"
						class="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
						data-design-kit-empty-branch={branch}
						aria-pressed={emptyStateBranch === branch}
						onclick={() => (emptyStateBranch = branch)}
					>
						{branch}
					</button>
				{/each}
				<span class="text-xs text-muted-foreground" data-design-kit-empty-branch-state>
					Branch: {emptyStateBranch}
				</span>
			</div>
			<div class="grid gap-3 sm:grid-cols-2" data-design-kit-empty-grid>
				{#each emptyStateFixtures as fixture (fixture.id)}
					<div
						class="grid gap-2 rounded-md border border-border bg-surface-sunken p-3"
						data-design-kit-empty-card={fixture.id}
					>
						<div
							class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground"
						>
							<span class="font-semibold">{fixture.stage}</span>
							<span class="flex-1"></span>
							<span>{fixture.route}</span>
						</div>
						{#if emptyStateBranch === "empty"}
							<EmptyState
								title={fixture.title}
								description={fixture.description}
								keyHint={fixture.keyHint}
								tone={fixture.tone}
							>
								{#snippet icon()}
									<span class="text-lg font-semibold" aria-hidden="true">○</span>
								{/snippet}
								{#snippet actions()}
									<button
										type="button"
										class="rounded-md border border-border bg-accent px-3 py-1.5 text-sm font-medium text-primary-foreground"
										data-design-kit-empty-primary={fixture.id}
									>
										{fixture.primary}
									</button>
									<button
										type="button"
										class="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
										data-design-kit-empty-ghost={fixture.id}
									>
										{fixture.ghost}
									</button>
								{/snippet}
							</EmptyState>
						{:else}
							<div
								class="grid place-items-center rounded-md border border-dashed border-border bg-card px-6 py-10 text-sm text-muted-foreground"
								data-design-kit-empty-populated={fixture.id}
							>
								{fixture.stage} has data — the populated branch renders here.
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="inline-error"
		>
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="text-lg font-semibold">ErrorBanner · inline error state</h2>
				<span class="text-xs text-muted-foreground"
					>COPY.md §3 · [what failed]. [why]. [next step]. trace=&lt;id&gt;</span
				>
			</div>
			<p class="text-sm text-muted-foreground">
				Errors live inline at the surface where they happen — never as toasts. Every failure
				carries a copyable trace id and an imperative recovery action. The COPY.md §3 hard-ban
				list (generic apology copy, vague reassurance) is enforced by design-e2e.
			</p>
			<div class="flex flex-wrap items-center gap-1">
				{#each ["error", "populated"] as const as branch}
					<button
						type="button"
						class="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
						data-design-kit-error-branch={branch}
						aria-pressed={errorStateBranch === branch}
						onclick={() => (errorStateBranch = branch)}
					>
						{branch}
					</button>
				{/each}
				<span class="text-xs text-muted-foreground" data-design-kit-error-branch-state>
					Branch: {errorStateBranch}
				</span>
			</div>
			<div class="grid gap-3" data-design-kit-error-grid>
				{#each inlineErrorFixtures as fixture (fixture.id)}
					<div data-design-kit-error-card={fixture.id}>
						{#if errorStateBranch === "error"}
							<ErrorBanner
								title={fixture.title}
								message={fixture.message}
								traceId={fixture.traceId}
								surface="block"
								retryLabel={fixture.retryLabel}
								onRetry={() => {}}
							/>
						{:else}
							<div
								class="rounded-md border border-dashed border-border bg-surface-sunken px-4 py-6 text-sm text-muted-foreground"
								data-design-kit-error-populated={fixture.id}
							>
								This surface is healthy — the populated branch renders here.
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="toast"
		>
			<h2 class="text-lg font-semibold">Toast</h2>
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					class="rounded-md border border-border px-3 py-1.5 text-xs"
					data-design-kit-toast-publish="success"
					onclick={() =>
						toastStore.publish({
							tone: "success",
							title: "Task captured",
							description: "Saved to inbox.",
							durationMs: 0,
						})}
				>
					Publish success
				</button>
				<button
					type="button"
					class="rounded-md border border-border px-3 py-1.5 text-xs"
					data-design-kit-toast-publish="error"
					onclick={() =>
						toastStore.publish({
							tone: "error",
							title: "Build failed",
							description: "Check the run log for details.",
							durationMs: 0,
						})}
				>
					Publish error
				</button>
				<span class="text-xs text-muted-foreground" data-design-kit-toast-count>
					Active: {toastStore.items.length}
				</span>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="textarea"
		>
			<h2 class="text-lg font-semibold">Textarea</h2>
			<div class="grid gap-3 sm:max-w-md">
				<Textarea
					bind:value={bioValue}
					placeholder="Share something about yourself"
					autoResize
					minRows={3}
					maxRows={8}
					aria-label="Bio"
					data-design-kit-textarea
				/>
				<span class="text-xs text-muted-foreground" data-design-kit-textarea-length>
					Length: {bioValue.length}
				</span>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="credential-input"
		>
			<h2 class="text-lg font-semibold">CredentialInput</h2>
			<div class="grid gap-4 sm:max-w-md">
				<label class="grid gap-1.5 text-sm">
					<span class="text-foreground font-medium">Default (masked)</span>
					<CredentialInput
						bind:value={credentialDefault}
						placeholder="Enter API key"
						aria-label="Default credential"
						data-design-kit-credential="default"
					/>
				</label>
				<label class="grid gap-1.5 text-sm">
					<span class="text-foreground font-medium">Pre-visible</span>
					<CredentialInput
						bind:value={credentialVisible}
						defaultVisible
						aria-label="Visible credential"
						data-design-kit-credential="visible"
					/>
				</label>
				<label class="grid gap-1.5 text-sm">
					<span class="text-foreground font-medium">With error</span>
					<CredentialInput
						bind:value={credentialError}
						aria-invalid="true"
						aria-label="Invalid credential"
						data-design-kit-credential="error"
					/>
					<span class="text-xs text-destructive" data-design-kit-credential-error>
						Key must start with <code>fk_</code>.
					</span>
				</label>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="switch"
		>
			<h2 class="text-lg font-semibold">Switch</h2>
			<label class="flex items-center gap-3 text-sm">
				<Switch bind:checked={notifyEnabled} aria-label="Notifications" />
				<span>Notifications enabled: <strong data-design-kit-switch-state>{notifyEnabled}</strong></span>
			</label>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="form-field"
		>
			<h2 class="text-lg font-semibold">FormField</h2>
			<div class="grid gap-4 sm:max-w-md">
				<FormField
					label="Task title"
					required
					htmlFor="form-field-title"
					description="Describe the outcome in a single sentence."
					error={titleError}
				>
					<input
						id="form-field-title"
						type="text"
						bind:value={titleValue}
						aria-invalid={titleError ? "true" : undefined}
						aria-describedby={titleError ? "form-field-title-error" : "form-field-title-description"}
						class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/30 aria-invalid:ring-2"
						data-design-kit-form-input
					/>
				</FormField>
				<FormField
					label="Owner"
					optional
					htmlFor="form-field-owner"
					description="Pick a default assignee for this task type."
				>
					<input
						id="form-field-owner"
						type="text"
						class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
					/>
				</FormField>
			</div>
		</article>
		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="popover"
		>
			<h2 class="text-lg font-semibold">Popover</h2>
			<div class="flex flex-wrap items-center gap-3">
				<Popover bind:open={popoverOpen}>
					<PopoverTrigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="rounded-md border border-border px-3 py-1.5 text-sm font-medium"
								data-design-kit-popover-trigger
							>
								Open popover
							</button>
						{/snippet}
					</PopoverTrigger>
					<PopoverContent data-design-kit-popover-content>
						<div class="space-y-2">
							<p class="text-sm font-medium">Quick note</p>
							<p class="text-xs text-muted-foreground">
								Popovers anchor to their trigger and dismiss on outside click.
							</p>
						</div>
					</PopoverContent>
				</Popover>
				<span class="text-xs text-muted-foreground" data-design-kit-popover-state>
					Open: {popoverOpen}
				</span>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="context-menu"
		>
			<h2 class="text-lg font-semibold">ContextMenu</h2>
			<ContextMenu>
				<ContextMenuTrigger>
					{#snippet child({ props })}
						<div
							{...props}
							class="grid h-24 cursor-context-menu place-items-center rounded-md border border-dashed border-border text-sm text-muted-foreground"
							data-design-kit-context-trigger
						>
							Right-click here
						</div>
					{/snippet}
				</ContextMenuTrigger>
				<ContextMenuContent data-design-kit-context-content>
					<ContextMenuItem data-design-kit-context-item="rename">Rename</ContextMenuItem>
					<ContextMenuItem data-design-kit-context-item="duplicate">Duplicate</ContextMenuItem>
					<ContextMenuItem tone="destructive" data-design-kit-context-item="delete">
						Delete
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="alert-dialog"
		>
			<h2 class="text-lg font-semibold">AlertDialog</h2>
			<div class="flex flex-wrap items-center gap-3">
				<AlertDialog bind:open={alertDialogOpen}>
					<AlertDialogTrigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-fg-inverse"
								data-design-kit-alert-trigger
							>
								Delete artifact
							</button>
						{/snippet}
					</AlertDialogTrigger>
					<AlertDialogContent data-design-kit-alert-content>
						<AlertDialogTitle>Delete this artifact?</AlertDialogTitle>
						<AlertDialogDescription>
							Removing the artifact removes any references in run reports.
						</AlertDialogDescription>
						<div class="flex justify-end gap-2">
							<AlertDialogCancel
								onclick={() => (alertDialogChoice = "cancelled")}
								data-design-kit-alert-cancel
							>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction
								tone="destructive"
								onclick={() => (alertDialogChoice = "confirmed")}
								data-design-kit-alert-confirm
							>
								Delete
							</AlertDialogAction>
						</div>
					</AlertDialogContent>
				</AlertDialog>
				<span class="text-xs text-muted-foreground" data-design-kit-alert-state>
					Choice: {alertDialogChoice || "—"}
				</span>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="skill-conflict-dialog"
		>
			<h2 class="text-lg font-semibold">Skill conflict dialog</h2>
			<div class="flex flex-wrap items-center gap-3">
				<Dialog bind:open={skillConflictOpen}>
					<DialogTrigger>
						{#snippet child({ props })}
							<Button {...props} variant="outline" data-design-kit-skill-conflict-trigger>
								Resolve conflict
							</Button>
						{/snippet}
					</DialogTrigger>
					<DialogContent data-design-kit-skill-conflict-content class="sm:max-w-3xl">
						<DialogHeader>
							<DialogTitle>Resolve skill conflict</DialogTitle>
							<DialogDescription>
								formatter v1 conflicts with formatter-candidate v2 because tool APIs changed.
							</DialogDescription>
						</DialogHeader>
						<div class="grid gap-3 md:grid-cols-2">
							<div class="rounded-md border border-border p-3">
								<Badge variant="success" size="sm">Recommended</Badge>
								<Label for="design-skill-alt-version" class="mt-3">Alternative version</Label>
								<Select bind:value={skillConflictAltVersion} type="single">
									<SelectTrigger
										id="design-skill-alt-version"
										aria-label="Alternative skill version"
										data-design-kit-skill-conflict-alt
									>
										<SelectValue placeholder="v1.latest" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="v1.latest" label="v1.latest" />
										<SelectItem value="v2.compat" label="v2.compat" />
									</SelectContent>
								</Select>
							</div>
							<div class="rounded-md border border-border p-3">
								<div class="flex items-center gap-2">
									<Checkbox
										bind:checked={skillConflictForceAcknowledged}
										aria-label="Acknowledge force warning"
										data-design-kit-skill-conflict-force-ack
									/>
									<span class="text-sm font-medium">Force if safe</span>
								</div>
								<p class="mt-2 text-xs text-muted-foreground">
									Requires compatibility check and explicit warning acknowledgement.
								</p>
							</div>
						</div>
						<DialogFooter class="flex-wrap gap-2">
							<Button
								data-design-kit-skill-conflict-confirm-alt
								onclick={() => (skillConflictChoice = `alt:${skillConflictAltVersion}`)}
							>
								Use alt version
							</Button>
							<Button
								variant="outline"
								data-design-kit-skill-conflict-skip
								onclick={() => (skillConflictChoice = "skip")}
							>
								Skip
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
				<span class="text-xs text-muted-foreground" data-design-kit-skill-conflict-state>
					Choice: {skillConflictChoice || "—"}
				</span>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="command-palette"
		>
			<h2 class="text-lg font-semibold">CommandPalette</h2>
			<div class="flex flex-wrap items-center gap-3">
				<button
					type="button"
					class="rounded-md border border-border px-3 py-1.5 text-sm"
					data-design-kit-palette-open
					onclick={() => (paletteOpen = true)}
				>
					Open palette
				</button>
				<span class="text-xs text-muted-foreground" data-design-kit-palette-choice>
					Last: {paletteChoice ?? "—"}
				</span>
			</div>
			<CommandPalette bind:open={paletteOpen}>
				<CommandPaletteInput placeholder="Search actions…" data-design-kit-palette-input />
				<CommandPaletteList>
					<CommandPaletteItem
						value="capture"
						data-design-kit-palette-item="capture"
						onSelect={() => {
							paletteChoice = "capture";
							paletteOpen = false;
						}}
					>
						Capture task
					</CommandPaletteItem>
					<CommandPaletteItem
						value="dispatch"
						data-design-kit-palette-item="dispatch"
						onSelect={() => {
							paletteChoice = "dispatch";
							paletteOpen = false;
						}}
					>
						Dispatch run
					</CommandPaletteItem>
					<CommandPaletteItem
						value="reset"
						data-design-kit-palette-item="reset"
						onSelect={() => {
							paletteChoice = "reset";
							paletteOpen = false;
						}}
					>
						Reset workspace
					</CommandPaletteItem>
					<CommandPaletteEmpty>No matches.</CommandPaletteEmpty>
				</CommandPaletteList>
			</CommandPalette>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="tabs"
		>
			<h2 class="text-lg font-semibold">Tabs</h2>
			<Tabs bind:value={activeTab}>
				<TabsList data-design-kit-tabs-list>
					<TabsTrigger value="overview" data-design-kit-tab="overview">Overview</TabsTrigger>
					<TabsTrigger value="runs" data-design-kit-tab="runs">Runs</TabsTrigger>
					<TabsTrigger value="settings" data-design-kit-tab="settings">Settings</TabsTrigger>
				</TabsList>
				<TabsContent value="overview" data-design-kit-tab-panel="overview">
					<p class="text-sm">Overview panel content.</p>
				</TabsContent>
				<TabsContent value="runs" data-design-kit-tab-panel="runs">
					<p class="text-sm">Runs panel content.</p>
				</TabsContent>
				<TabsContent value="settings" data-design-kit-tab-panel="settings">
					<p class="text-sm">Settings panel content.</p>
				</TabsContent>
			</Tabs>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="breadcrumb"
		>
			<h2 class="text-lg font-semibold">Breadcrumb</h2>
			<Breadcrumb items={breadcrumbItems} />
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="pagination"
		>
			<h2 class="text-lg font-semibold">Pagination</h2>
			<Pagination bind:page={currentPage} count={47} perPage={10} siblingCount={1} />
			<span class="text-xs text-muted-foreground" data-design-kit-pagination-value>
				Current page: {currentPage}
			</span>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="stepper"
		>
			<h2 class="text-lg font-semibold">Stepper</h2>
			<Stepper steps={stepperSteps} currentStep={1} />
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="data-table"
		>
			<h2 class="text-lg font-semibold">DataTable</h2>
			<DataTable
				columns={dataTableColumns}
				rows={sortedRows}
				rowKey={(row) => row.id}
				sort={dataTableSort}
				onSort={(next) => (dataTableSort = next)}
			/>
			<span class="text-xs text-muted-foreground" data-design-kit-table-sort>
				Sort: {dataTableSort.field} {dataTableSort.direction}
			</span>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="data-list"
		>
			<h2 class="text-lg font-semibold">DataList</h2>
			<DataList items={dataListItems} variant="inline" />
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="tree-view"
		>
			<h2 class="text-lg font-semibold">TreeView</h2>
			<TreeView
				nodes={treeNodes}
				bind:expandedIds={treeExpanded}
				bind:selectedId={treeSelected}
			/>
			<span class="text-xs text-muted-foreground" data-design-kit-tree-selection>
				Selected: {treeSelected ?? "—"}
			</span>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="stat"
		>
			<h2 class="text-lg font-semibold">Stat</h2>
			<div class="grid gap-3 sm:grid-cols-3">
				<Stat label="Active runs" value="12" delta="+3" trend="up" hint="vs last 7d" />
				<Stat label="Backlog" value="58" delta="-4" trend="down" />
				<Stat label="Open reviews" value="7" delta="0" trend="flat" />
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="mode-row"
		>
			<h2 class="text-lg font-semibold">ModeRow</h2>
			<ModeRow
				bind:value={activeMode}
				modes={["manual", "play", "discuss", "ai-assist"]}
				onSelect={(mode) => (activeMode = mode)}
			/>
			<span class="text-xs text-muted-foreground" data-design-kit-mode-active>
				Active mode: {activeMode}
			</span>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="trace-chip"
		>
			<h2 class="text-lg font-semibold">TraceChip / TraceBadge</h2>
			<div class="flex flex-wrap items-center gap-2">
				<TraceChip
					badge
					traceId="4f3a1c9e2b7d8a6c5e1f0d3b9a7c2e4f"
					project="fulcrum"
					cycle="cycle-12"
					timestamp="2026-05-20 13:04 UTC"
					onCopy={(id) => {
						copiedTrace = id;
						traceCopied = id;
					}}
					onOpenAudit={() => (traceAction = "audit")}
					onOpenCli={() => (traceAction = "cli")}
				/>
				<TraceChip traceId="trace-shortid" short={false} copyable={false} />
				<span class="text-xs text-muted-foreground" data-design-kit-trace-copied>
					Copied: {copiedTrace ?? "—"}
				</span>
				<span class="text-xs text-muted-foreground" data-design-kit-trace-action>
					Action: {traceAction ?? "—"}
				</span>
			</div>
			<p class="text-xs text-muted-foreground">
				DESIGN.md §4.10 TraceBadge — <code class="rounded bg-muted px-1 text-[11px]">badge</code> prop:
				<code class="rounded bg-muted px-1 text-[11px]">trace:</code> prefix, 8-char hex, surface-sunken,
				hover tooltip, right-click Open in audit / Open in CLI.
			</p>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="stage-rail"
		>
			<h2 class="text-lg font-semibold">StageRail</h2>
			<p class="text-xs text-muted-foreground">
				DESIGN.md §3.1 — 220px expanded / 56px collapsed left rail; six WorkflowStages, then a
				persistent Workspace (Portfolio) group, then a System group.
			</p>
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					class="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
					data-design-kit-rail-toggle
					onclick={() => (railCollapsed = !railCollapsed)}
				>
					Toggle collapse
				</button>
				<span class="text-xs text-muted-foreground" data-design-kit-rail-state>
					Stage: {railStage} · collapsed: {railCollapsed}
				</span>
			</div>
			<div class="flex h-[360px] overflow-hidden rounded-md border border-border">
				<StageRail
					bind:current={railStage}
					bind:collapsed={railCollapsed}
					stages={[
						{ stage: "capture", count: 7 },
						{ stage: "plan", count: 3 },
						{ stage: "build", count: 12 },
						{ stage: "review", count: 2 },
						{ stage: "ship" },
						{ stage: "operate" },
					]}
					workspace={railWorkspace}
					system={railSystem}
				/>
				<div class="flex-1 bg-surface p-4 text-sm text-muted-foreground">Stage content</div>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="scope-bar"
		>
			<h2 class="text-lg font-semibold">ScopeBar</h2>
			<p class="text-xs text-muted-foreground">
				DESIGN.md §3.1 — 48px top chrome: brand · workspace · stage tabs · trace · system cluster.
			</p>
			<div class="overflow-hidden rounded-md border border-border">
				<ScopeBar
					bind:activeStage={scopeStage}
					brand="Fulcrum"
					workspacePath="mkh / fulcrum · auth-rewrite"
				>
					{#snippet trace()}
						<TraceChip badge traceId="4f3a1c9e2b7d8a6c5e1f0d3b9a7c2e4f" project="fulcrum" />
					{/snippet}
					{#snippet systemCluster()}
						<button
							type="button"
							aria-label="Command palette · ⌘K"
							aria-expanded="false"
							class="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-surface-sunken"
							>⌘K</button
						>
						<button
							type="button"
							aria-label="Notifications · 2 unread"
							aria-expanded="false"
							class="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-surface-sunken"
							>🔔</button
						>
						<button
							type="button"
							aria-label="Display, density, mode, theme"
							aria-expanded="false"
							class="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-surface-sunken"
							>⚙</button
						>
						<button
							type="button"
							aria-label="Keyboard shortcuts · ?"
							aria-expanded="false"
							class="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-surface-sunken"
							>?</button
						>
					{/snippet}
				</ScopeBar>
			</div>
			<span class="text-xs text-muted-foreground" data-design-kit-scope-stage>
				Active stage: {scopeStage}
			</span>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="status-footer"
		>
			<h2 class="text-lg font-semibold">StatusFooter</h2>
			<p class="text-xs text-muted-foreground">
				DESIGN.md §3.1 / IA-MAP.md §3 — 44px bottom strip; compact 38 / base 44 / comfortable 50.
				Left segments mode · profile · branch · run x/y · agent · MCP; right segments trace ·
				time · ? · ⌘K, then the right-most AI Assist segment with accent left-border.
			</p>
			<div class="flex flex-wrap gap-1">
				{#each ["compact", "base", "comfortable"] as const as mode}
					<button
						type="button"
						class="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
						data-design-kit-footer-mode={mode}
						onclick={() => (footerMode = mode)}
					>
						{mode}
					</button>
				{/each}
			</div>
			<div class="overflow-hidden rounded-md border border-border">
				<StatusFooter
					bind:mode={footerMode}
					segments={footerSegments}
					onAiAssist={() => (acpOpen = true)}
				>
					{#snippet rightCluster()}
						<TraceChip badge traceId="4f3a1c9e2b7d8a6c5e1f0d3b9a7c2e4f" project="fulcrum" />
						<span class="font-mono text-[11px] text-fg-subtle">13:04</span>
						<button
							type="button"
							aria-label="Keyboard shortcuts · ?"
							class="grid size-6 place-items-center rounded-sm text-fg-subtle hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							><span aria-hidden="true">?</span></button
						>
						<button
							type="button"
							aria-label="Command palette · ⌘K"
							class="grid h-6 place-items-center rounded-sm px-1 font-mono text-[11px] text-fg-subtle hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							><span aria-hidden="true">⌘K</span></button
						>
					{/snippet}
				</StatusFooter>
			</div>
			<span class="text-xs text-muted-foreground" data-design-kit-footer-state>
				Footer mode: {footerMode}
			</span>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="acp-drawer"
		>
			<h2 class="text-lg font-semibold">AI Assist panel</h2>
			<p class="text-xs text-muted-foreground">
				DESIGN.md §3.1 / apps/web CONTEXT.md — 420px right overlay for AI Assist; mobile bottom
				sheet branch composes the ui-kit Sheet primitive.
			</p>
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					class="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
					data-design-kit-acp-open="right"
					onclick={() => {
						acpSide = "right";
						acpOpen = true;
					}}
				>
					Open right drawer
				</button>
				<button
					type="button"
					class="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
					data-design-kit-acp-open="bottom"
					onclick={() => {
						acpSide = "bottom";
						acpOpen = true;
					}}
				>
					Open bottom sheet
				</button>
				<span class="text-xs text-muted-foreground" data-design-kit-acp-state>
					Open: {acpOpen} · side: {acpSide}
				</span>
			</div>
			<AssistPanel
				bind:open={acpOpen}
				side={acpSide}
				title="AI Assist"
				scopeLabel="Step 3/8 · AUTH-43"
				agentLabel={acpAgents.find((a) => a.id === acpAgent)?.name ?? acpAgent}
				agents={acpAgents}
				meta={acpMeta}
				onAgentSelect={(id) => (acpAgent = id)}
				onExpand={() => {}}
				onSaveThread={() => (acpSaved = true)}
			>
				{#snippet trace()}
					<TraceChip badge traceId="4f3a1c9e2b7d8a6c5e1f0d3b9a7c2e4f" project="fulcrum" />
				{/snippet}
				<p data-design-kit-acp-thread>Live thread streams agent messages here.</p>
				{#if acpSaved}
					<p class="text-xs text-fg-subtle" data-design-kit-acp-saved>
						Thread saved as prompt template
					</p>
				{/if}
				{#snippet composer()}
					<div class="flex items-center gap-2">
						<input
							type="text"
							placeholder="Continue the session…"
							class="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
						/>
						<button
							type="button"
							class="rounded-md bg-accent px-3 py-1.5 text-sm text-primary-foreground"
							>▶ Send</button
						>
					</div>
				{/snippet}
			</AssistPanel>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="run-feed-item"
		>
			<h2 class="text-lg font-semibold">RunFeedItem</h2>
			<div class="rounded-md border border-border bg-card">
				<RunFeedItem
					runId="run-001"
					taskKey="FUL-204"
					taskTitle="Wire view sorting"
					agentName="Sonnet 4.6"
					status="running"
					elapsed="2m 14s"
					lastEvent="Applied diff to apps/web/src/routes/view-controls"
				/>
				<RunFeedItem
					runId="run-002"
					taskKey="FUL-198"
					taskTitle="Review saved filter"
					agentName="Opus 4.7"
					status="waiting-input"
					elapsed="42s"
					lastEvent="Awaiting permission for delete"
				/>
				<RunFeedItem
					runId="run-003"
					taskKey="FUL-176"
					taskTitle="Archive stale view"
					agentName="Sonnet 4.6"
					status="completed"
					elapsed="3m 02s"
					lastEvent="Tests green"
				/>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="task-row"
		>
			<h2 class="text-lg font-semibold">TaskRow</h2>
			<div class="rounded-md border border-border bg-card">
				<TaskRow
					taskKey="FUL-204"
					title="Wire view sorting"
					status="running"
					priority="P1"
					assignee="Mo K."
					estimate={8}
					bind:selected={taskSelected}
				/>
				<TaskRow
					taskKey="FUL-176"
					title="Archive stale view"
					status="completed"
					priority="P3"
					assignee="Sam L."
					estimate={1}
				/>
			</div>
			<span class="text-xs text-muted-foreground" data-design-kit-task-selected>
				Selected first row: {taskSelected}
			</span>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="agent-identity-card"
		>
			<h2 class="text-lg font-semibold">AgentIdentityCard</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				<AgentIdentityCard
					name="Sonnet 4.6"
					provider="Anthropic"
					model="claude-sonnet-4-6"
					tokenBudget={200000}
					tokensUsed={87423}
					capabilities={["code", "edit", "review"]}
					costPerCall="$0.18"
				/>
				<AgentIdentityCard
					name="Opus 4.7"
					provider="Anthropic"
					model="claude-opus-4-7"
					tokenBudget={400000}
					tokensUsed={42101}
					capabilities={["code", "plan", "review", "browse"]}
					costPerCall="$0.62"
				/>
			</div>
		</article>

		<article
			id="copy-lock"
			class="grid gap-5 rounded-md border border-border bg-card p-5"
			data-design-kit-section="copy-lock"
			data-copy-lock=""
		>
			<header class="grid gap-1">
				<h2 class="text-lg font-semibold">Copy lock</h2>
				<p class="text-sm text-muted-foreground">
					Every COPY.md user-visible literal, machine-checked. The copy-lock design-e2e
					spec asserts these exact strings render and that no banned synonym, em dash,
					first-person plural, or transport-protocol chrome label is present in this fixture.
				</p>
			</header>

			<!-- COPY.md §6 — canonical 8-state status vocabulary. -->
			<section class="grid gap-2" data-copy-lock-group="status-labels">
				<h3 class="text-sm font-semibold">Status labels · COPY.md §6</h3>
				<div class="flex flex-wrap items-center gap-2">
					{#each copyLockStatusVocab as status (status)}
						<span data-copy-lock-status={status}>
							<StatusBadge {status} />
						</span>
					{/each}
				</div>
				<p class="text-xs text-muted-foreground">
					Canonical vocab:
					<code data-copy-lock-status-vocab>{copyLockStatusVocab.join(" / ")}</code>.
					Banned synonyms are never rendered:
					<span data-copy-lock-banned-status hidden>{copyLockBannedStatus.join(", ")}</span>
				</p>
			</section>

			<!-- COPY.md §4 — confirmation copy. -->
			<section class="grid gap-2" data-copy-lock-group="confirmations">
				<h3 class="text-sm font-semibold">Confirmations · COPY.md §4</h3>
				<ul class="grid gap-1">
					{#each copyLockConfirmations as entry (entry.id)}
						<li class="text-sm" data-copy-lock-confirmation={entry.id}>{entry.label}</li>
					{/each}
				</ul>
			</section>

			<!-- COPY.md §10 — permission prompt buttons + abort reasons. -->
			<section class="grid gap-2" data-copy-lock-group="permission">
				<h3 class="text-sm font-semibold">Permission prompt · COPY.md §10</h3>
				<div class="flex flex-wrap gap-2">
					{#each copyLockPermissionButtons as entry (entry.id)}
						<span
							class="rounded border border-border px-2 py-1 text-xs"
							data-copy-lock-permission-button={entry.id}>{entry.label}</span
						>
					{/each}
				</div>
				<p class="text-sm font-medium" data-copy-lock-abort-title>{copyLockAbortTitle}</p>
				<div class="flex flex-wrap gap-2">
					{#each copyLockAbortReasons as entry (entry.id)}
						<span
							class="rounded bg-muted px-2 py-1 text-xs"
							data-copy-lock-abort-reason={entry.id}>{entry.label}</span
						>
					{/each}
				</div>
			</section>

			<!-- COPY.md §11 — notification templates. -->
			<section class="grid gap-2" data-copy-lock-group="notifications">
				<h3 class="text-sm font-semibold">Notifications · COPY.md §11</h3>
				<ul class="grid gap-1">
					{#each copyLockNotifications as entry (entry.id)}
						<li class="text-sm" data-copy-lock-notification={entry.id}>{entry.label}</li>
					{/each}
				</ul>
			</section>

			<!-- COPY.md §12 — settings inheritance chips. -->
			<section class="grid gap-2" data-copy-lock-group="settings">
				<h3 class="text-sm font-semibold">Settings chips · COPY.md §12</h3>
				<div class="flex flex-wrap gap-2">
					{#each copyLockSettingsChips as entry (entry.id)}
						<Chip data-copy-lock-settings-chip={entry.id}>{entry.label}</Chip>
					{/each}
				</div>
			</section>

			<!-- COPY.md §13 — telemetry first-run options. -->
			<section class="grid gap-2" data-copy-lock-group="telemetry">
				<h3 class="text-sm font-semibold">Telemetry options · COPY.md §13</h3>
				<div class="flex flex-wrap gap-2">
					{#each copyLockTelemetryOptions as entry (entry.id)}
						<span
							class="rounded border border-border px-2 py-1 text-xs"
							data-copy-lock-telemetry-option={entry.id}>{entry.label}</span
						>
					{/each}
				</div>
			</section>
		</article>
	</section>
	<ToastRegion store={toastStore} position="bottom-right" />
</main>
