<script lang="ts">
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
		AcpDrawer,
	} from "@fulcrum/ui-kit";
	import type {
		SortState,
		TreeNode,
		WorkflowMode,
		WorkflowStage,
		StatusFooterMode,
		AcpDrawerSide,
	} from "@fulcrum/ui-kit";

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
	let acpSide = $state<AcpDrawerSide>("right");
	let traceCopied = $state<string | null>(null);
	let traceAction = $state<string | null>(null);
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
			<ModeRow bind:value={activeMode} onSelect={(mode) => (activeMode = mode)} />
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
					traceId="trace-9d8f7e6a-2c3b-4d5e-87f6-abcd12345678"
					onCopy={(id) => (copiedTrace = id)}
				/>
				<TraceChip traceId="trace-shortid" short={false} copyable={false} />
			</div>
			<p class="text-xs text-muted-foreground">
				DESIGN.md §4.10 TraceBadge — <code class="rounded bg-muted px-1 text-[11px]">badge</code> prop:
				<code class="rounded bg-muted px-1 text-[11px]">trace:</code> prefix, 8-char hex, surface-sunken,
				hover tooltip, right-click Open in audit / Open in CLI.
			</p>
			<div class="flex flex-wrap items-center gap-3">
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
				<TraceChip badge traceId="8b2d4a6f1c3e5d7a" copyable={false} />
				<span class="text-xs text-muted-foreground" data-design-kit-trace-copied>
					Copied: {copiedTrace ?? "—"}
				</span>
				<span class="text-xs text-muted-foreground" data-design-kit-trace-action>
					Action: {traceAction ?? "—"}
				</span>
			</div>
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
				DESIGN.md §3.1 — 44px bottom strip; compact 38 / base 44 / comfortable 50; right-most AI
				Assist segment with accent left-border.
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
						<TraceChip badge traceId="4f3a1c9e2b7d8a6c5e1f0d3b9a7c2e4f" copyable={false} />
						<span class="font-mono text-[11px] text-fg-subtle">13:04</span>
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
			<h2 class="text-lg font-semibold">AcpDrawer</h2>
			<p class="text-xs text-muted-foreground">
				DESIGN.md §3.1 / apps/web CONTEXT.md — 420px right overlay AI Assist drawer; mobile bottom
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
			<AcpDrawer
				bind:open={acpOpen}
				side={acpSide}
				title="AI Assist"
				scopeLabel="Step 3/8 · AUTH-43"
			>
				{#snippet trace()}
					<TraceChip badge traceId="4f3a1c9e2b7d8a6c5e1f0d3b9a7c2e4f" project="fulcrum" />
				{/snippet}
				<p data-design-kit-acp-thread>Live thread streams agent messages here.</p>
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
			</AcpDrawer>
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
	</section>
	<ToastRegion store={toastStore} position="bottom-right" />
</main>
