<script lang="ts">
	/**
	 * Review queue: `/review`, the production surface for OD `review-queue.html`.
	 *
	 * `prd-web-review-queue-od-fidelity`. The canonical IA-MAP §2.4 home is
	 * `/<ws>/projects/<projId>/review`; this top-level `/review` folder is the
	 * rendered production review-queue route the stage workbench links to and the
	 * StageRail resolves under the Review WorkflowStage.
	 *
	 * The OD ships the **Review queue**: the intake list of PRs/reviews awaiting
	 * an operator decision:
	 *
	 *  - a `page-head` (`Review queue` + a count line `3 awaiting review · 12
	 *    merged today`);
	 *  - a four-tab lifecycle strip (`Awaiting review` / `Changes requested` /
	 *    `Approved` / `Merged today`), each with a count pill: `CLI-TUI-UX.md`
	 *    §478 maps the TUI `:review` tabs to this exact set;
	 *  - a `pr-row` grid: PR icon, title + `desc` (`FUL-1284 · 14 files changed ·
	 *    +287 −94`), a four-dot check-row (lint/test/bench/a11y), stacked reviewer
	 *    avatars, a status badge, relative age, and a compact per-Step mode row;
	 *  - an `empty-state` block reconciled to `COPY.md` review-queue.
	 *
	 * Status vocabulary is the canonical `COPY.md` §6 / §362 8-state set -
	 * `awaiting` maps to `waiting-input`; `changes` to `blocked`; `approved` to
	 * `passing`; `merged` to `completed`. A non-canonical synonym is a copy bug,
	 * so every tab label and row badge resolves through `@fulcrum/ui-kit`
	 * `StatusBadge` / `statusLabel`.
	 *
	 * Migration note (`design-alignment/review.md` §review-queue): the
	 * `review-search` route's kind/status/author filter logic is **re-homed** into
	 * this queue's tab + filter model: no feature loss. `review-search` itself is
	 * deferred (`design-alignment/review.md` disposition: "Absorb → defer route").
	 *
	 * Every UI primitive is composed from `@fulcrum/ui-kit` per the AGENTS.md
	 * ui-kit rule; the per-row mode row is the universal `ModeAffordance`
	 * (`prd-web-mode-affordance-system`) wired through `mode-affordance-host`, and
	 * its `⊞ AI Assist` button opens the one shell `AcpDrawer`
	 * (`prd-web-global-ai-assist-drawer`).
	 */
	import {
		Avatar,
		AvatarFallback,
		Badge,
		Button,
		EmptyState,
		StatusBadge,
		statusLabel,
		type WorkflowStatus,
	} from "@fulcrum/ui-kit";
	import {
		ModeRow,
		createStepModeRow,
		modeAffordanceHooks,
		type ModeStepScope,
	} from "$lib/components/app/mode-affordance-host.ts";
	import { cn } from "@fulcrum/ui-kit";

	/**
	 * The four review lifecycle tabs (OD `review-queue.html` lines 58–63;
	 * `CLI-TUI-UX.md` §478 `:review` tabs). Each tab carries the OD label and the
	 * canonical `WorkflowStatus` a row in that tab maps to: `awaiting` →
	 * `waiting-input`, `changes` → `blocked`, `approved` → `passing`, `merged` →
	 * `completed` (`COPY.md` §362 8-state vocab).
	 */
	type ReviewLifecycle = "awaiting" | "changes" | "approved" | "merged";

	interface LifecycleTab {
		id: ReviewLifecycle;
		/** OD tab label, verbatim from `review-queue.html`. */
		label: string;
		/** Canonical `WorkflowStatus` a row in this tab carries (`COPY.md` §362). */
		status: WorkflowStatus;
	}

	const LIFECYCLE_TABS: readonly LifecycleTab[] = [
		{ id: "awaiting", label: "Awaiting review", status: "waiting-input" },
		{ id: "changes", label: "Changes requested", status: "blocked" },
		{ id: "approved", label: "Approved", status: "passing" },
		{ id: "merged", label: "Merged today", status: "completed" },
	] as const;

	/** A pre-merge check result: the OD four-dot check-row (lint/test/bench/a11y). */
	type CheckTone = "ok" | "warn" | "danger";

	interface ReviewCheck {
		/** Check name: surfaces in the dot `title` for hover + a11y. */
		name: string;
		tone: CheckTone;
	}

	/** A reviewer assigned to a PR: rendered as a stacked monogram avatar. */
	interface Reviewer {
		/** Stable id used as the avatar key. */
		id: string;
		/** Full name: the avatar `aria-label` / monogram source. */
		name: string;
	}

	/**
	 * One PR/review item in the queue: the OD `pr-row`. Each carries a stable
	 * `key` (`FUL-1284`), a title, a `diff` summary, the four checks, reviewers, a
	 * lifecycle, a relative `age`, and: for `review-search` parity: the
	 * `kind`/`status`/`author` the re-homed filter model queries.
	 */
	interface ReviewRow {
		key: string;
		title: string;
		/** Diff summary: files + insertions/deletions, OD `desc` line. */
		diff: string;
		checks: readonly ReviewCheck[];
		reviewers: readonly Reviewer[];
		lifecycle: ReviewLifecycle;
		/** Relative age string (`5m ago`). */
		age: string;
		/** Re-homed `review-search` facet: the kind of change under review. */
		kind: "diff" | "plan" | "prototype" | "annotation" | "feedback";
		/** Re-homed `review-search` facet: the author who opened the review. */
		author: string;
	}

	/**
	 * The queue rows. Reference content mirrors OD `review-queue.html` (the three
	 * `awaiting` PRs + the two `merged` PRs) and extends it across the
	 * `changes`/`approved` lifecycle tabs so every tab is exercised. This is
	 * rendered reference data for the production route, not a production-API mock
	 *: the queue route ships before its `reviews.list` tRPC binding, exactly as
	 * the sibling stage-workbench OD-fidelity routes do.
	 */
	const REVIEW_ROWS: readonly ReviewRow[] = [
		{
			key: "FUL-1284",
			title: "Rework token refresh for offline mode",
			diff: "14 files changed · +287 −94",
			checks: [
				{ name: "lint", tone: "ok" },
				{ name: "test", tone: "ok" },
				{ name: "bench", tone: "warn" },
				{ name: "a11y", tone: "ok" },
			],
			reviewers: [
				{ id: "m", name: "Mara Singh" },
				{ id: "s", name: "Sven Olsen" },
			],
			lifecycle: "awaiting",
			age: "5m ago",
			kind: "diff",
			author: "mara",
		},
		{
			key: "FUL-1283",
			title: "Cross-surface trace stitch",
			diff: "8 files changed · +412 −38",
			checks: [
				{ name: "lint", tone: "ok" },
				{ name: "test", tone: "ok" },
				{ name: "bench", tone: "ok" },
				{ name: "a11y", tone: "ok" },
			],
			reviewers: [
				{ id: "m", name: "Mara Singh" },
				{ id: "a", name: "Ada Lin" },
			],
			lifecycle: "awaiting",
			age: "42m ago",
			kind: "diff",
			author: "ada",
		},
		{
			key: "FUL-1281",
			title: "MCP server health rollup",
			diff: "5 files changed · +156 −22",
			checks: [
				{ name: "lint", tone: "ok" },
				{ name: "test", tone: "ok" },
				{ name: "bench", tone: "ok" },
				{ name: "a11y", tone: "warn" },
			],
			reviewers: [{ id: "s", name: "Sven Olsen" }],
			lifecycle: "awaiting",
			age: "2h ago",
			kind: "diff",
			author: "sven",
		},
		{
			key: "FUL-1279",
			title: "Planning tripane keyboard map",
			diff: "11 files changed · +203 −150",
			checks: [
				{ name: "lint", tone: "ok" },
				{ name: "test", tone: "danger" },
				{ name: "bench", tone: "ok" },
				{ name: "a11y", tone: "warn" },
			],
			reviewers: [
				{ id: "a", name: "Ada Lin" },
				{ id: "m", name: "Mara Singh" },
			],
			lifecycle: "changes",
			age: "1h ago",
			kind: "plan",
			author: "ada",
		},
		{
			key: "FUL-1277",
			title: "Onboarding empty-state copy pass",
			diff: "6 files changed · +88 −61",
			checks: [
				{ name: "lint", tone: "warn" },
				{ name: "test", tone: "ok" },
				{ name: "bench", tone: "ok" },
				{ name: "a11y", tone: "ok" },
			],
			reviewers: [{ id: "c", name: "Carol Reyes" }],
			lifecycle: "changes",
			age: "3h ago",
			kind: "prototype",
			author: "carol",
		},
		{
			key: "FUL-1276",
			title: "ScopeBar trace-chip alignment",
			diff: "4 files changed · +52 −19",
			checks: [
				{ name: "lint", tone: "ok" },
				{ name: "test", tone: "ok" },
				{ name: "bench", tone: "ok" },
				{ name: "a11y", tone: "ok" },
			],
			reviewers: [
				{ id: "s", name: "Sven Olsen" },
				{ id: "m", name: "Mara Singh" },
			],
			lifecycle: "approved",
			age: "20m ago",
			kind: "diff",
			author: "sven",
		},
		{
			key: "FUL-1274",
			title: "Sugiyama layered graph engine",
			diff: "22 files changed · +890 −214",
			checks: [
				{ name: "lint", tone: "ok" },
				{ name: "test", tone: "ok" },
				{ name: "bench", tone: "ok" },
				{ name: "a11y", tone: "ok" },
			],
			reviewers: [
				{ id: "m", name: "Mara Singh" },
				{ id: "s", name: "Sven Olsen" },
			],
			lifecycle: "merged",
			age: "1h ago",
			kind: "diff",
			author: "mara",
		},
		{
			key: "FUL-1268",
			title: "Status footer parity across TUI + web",
			diff: "6 files changed · +124 −41",
			checks: [
				{ name: "lint", tone: "ok" },
				{ name: "test", tone: "ok" },
				{ name: "bench", tone: "ok" },
				{ name: "a11y", tone: "ok" },
			],
			reviewers: [{ id: "m", name: "Mara Singh" }],
			lifecycle: "merged",
			age: "3h ago",
			kind: "diff",
			author: "mara",
		},
	] as const;

	/** The re-homed `review-search` kind facet: `all` plus every review kind. */
	const KIND_FILTERS = ["all", "diff", "plan", "prototype", "annotation", "feedback"] as const;
	type KindFilter = (typeof KIND_FILTERS)[number];

	/** Selected lifecycle tab: regroups the queue (interaction assertion). */
	let activeTab = $state<ReviewLifecycle>("awaiting");
	/** Re-homed `review-search` facets: kind select + author text filter. */
	let kindFilter = $state<KindFilter>("all");
	let authorFilter = $state("");

	/** Per-lifecycle row count: drives the OD tab count pills + head count. */
	const countByLifecycle = $derived(
		LIFECYCLE_TABS.reduce<Record<ReviewLifecycle, number>>(
			(acc, tab) => {
				acc[tab.id] = REVIEW_ROWS.filter((row) => row.lifecycle === tab.id).length;
				return acc;
			},
			{ awaiting: 0, changes: 0, approved: 0, merged: 0 },
		),
	);

	/**
	 * The queue rows for the active tab, narrowed by the re-homed `review-search`
	 * kind + author facets. Tab selection regroups by lifecycle; the kind/author
	 * filters preserve the `review-search` feature set with no loss.
	 */
	const visibleRows = $derived(
		REVIEW_ROWS.filter((row) => {
			if (row.lifecycle !== activeTab) return false;
			if (kindFilter !== "all" && row.kind !== kindFilter) return false;
			if (authorFilter && !row.author.toLowerCase().includes(authorFilter.toLowerCase())) {
				return false;
			}
			return true;
		}),
	);

	/** The OD head count line: `3 awaiting review · 12 merged today`. */
	const headCount = $derived(
		`${countByLifecycle.awaiting} awaiting review · ${countByLifecycle.merged} merged today`,
	);

	/** The canonical `WorkflowStatus` for a lifecycle (tab + row badge share it). */
	function lifecycleStatus(lifecycle: ReviewLifecycle): WorkflowStatus {
		return LIFECYCLE_TABS.find((tab) => tab.id === lifecycle)?.status ?? "waiting-input";
	}

	/** Two-letter monogram from a reviewer name: OD `.avatar` content. */
	function monogram(name: string): string {
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0] ?? "")
			.join("")
			.toUpperCase();
	}

	/** The mode-affordance scope for a review row: a `review-item` Step. */
	function rowScope(row: ReviewRow): ModeStepScope {
		return { stepId: row.key, kind: "review-item", title: row.title };
	}

	/** Whether the active tab currently shows zero rows (empty-state branch). */
	const isEmpty = $derived(visibleRows.length === 0);
</script>

<svelte:head>
	<title>Review · Queue</title>
</svelte:head>

<main
	class="mx-auto max-w-[1400px] space-y-4 px-6 pb-20 pt-5"
	data-review-queue
	data-state={isEmpty ? "empty" : "populated"}
>
	<!-- page-head: OD `review-queue.html` lines 46–49. -->
	<header class="flex items-baseline gap-3" data-review-queue-head>
		<h1 class="text-[22px] font-semibold tracking-tight text-foreground">Review queue</h1>
		<span class="font-mono text-xs text-muted-foreground" data-review-queue-count>
			{headCount}
		</span>
	</header>

	<!--
		Re-homed `review-search` facets. `design-alignment/review.md` §review-queue:
		the `review-search` kind/status/author filter logic folds into the queue's
		tab + filter model: no feature loss. Lifecycle (status) is the tab strip;
		kind + author stay as filter controls here.
	-->
	<section
		class="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
		data-review-queue-filters
		aria-label="Queue filters"
	>
		<label class="flex items-center gap-2 text-xs text-muted-foreground">
			Kind
			<select
				data-review-filter-kind
				bind:value={kindFilter}
				class="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
			>
				{#each KIND_FILTERS as kind (kind)}
					<option value={kind}>{kind}</option>
				{/each}
			</select>
		</label>
		<label class="flex items-center gap-2 text-xs text-muted-foreground">
			Author
			<input
				data-review-filter-author
				bind:value={authorFilter}
				placeholder="filter by author"
				class="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
				aria-label="Filter reviews by author"
			/>
		</label>
	</section>

	<!--
		Four-tab lifecycle strip: OD `review-queue.html` lines 58–63;
		`CLI-TUI-UX.md` §478 `:review` tabs. Tab labels use canonical copy; the
		count pill mirrors the OD `.pill`. Selecting a tab regroups the queue.
	-->
	<div
		class="flex border-b border-border"
		role="tablist"
		aria-label="Review lifecycle"
		data-review-queue-tabs
	>
		{#each LIFECYCLE_TABS as tab (tab.id)}
			{@const active = tab.id === activeTab}
			<button
				type="button"
				role="tab"
				id={`review-tab-${tab.id}`}
				aria-selected={active}
				aria-controls="review-queue-rows"
				tabindex={active ? 0 : -1}
				data-review-tab={tab.id}
				data-active={active ? "true" : undefined}
				class={cn(
					"flex items-center gap-1 border-b-2 px-3.5 py-2 text-xs transition-colors",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
					active
						? "border-primary font-semibold text-primary"
						: "border-transparent text-muted-foreground hover:text-foreground",
				)}
				onclick={() => (activeTab = tab.id)}
			>
				{tab.label}
				<span
					data-review-tab-count={tab.id}
					class={cn(
						"rounded-full px-1.5 py-px font-mono text-[10px]",
						active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
					)}
				>
					{countByLifecycle[tab.id]}
				</span>
			</button>
		{/each}
	</div>

	<!--
		The queue rows for the active tab. Each row is the OD `pr-row`: a PR icon,
		title + diff `desc`, a four-dot check-row, stacked reviewer avatars, a
		canonical status badge, relative age, and a compact per-Step mode row.
	-->
	<section
		id="review-queue-rows"
		role="tabpanel"
		aria-labelledby={`review-tab-${activeTab}`}
		data-review-queue-rows
	>
		{#if isEmpty}
			<!--
				Empty state: reconciled to `COPY.md` review-queue (lines 68–69):
				H2 `No reviews waiting.`, body `Items appear here when a task moves to
				in-review. Push something forward.`, actions `Open board` / `View
				completed`. The OD inline copy ("Push a branch or open a PR…") is a
				draft; COPY.md governs.
			-->
			<EmptyState
				data-review-queue-empty
				title="No reviews waiting."
				description="Items appear here when a task moves to in-review. Push something forward."
			>
				{#snippet actions()}
					<Button data-review-empty-board href="/build-board">Open board</Button>
					<Button data-review-empty-completed variant="secondary" onclick={() => (activeTab = "merged")}>
						View completed
					</Button>
				{/snippet}
			</EmptyState>
		{:else}
			<ul class="divide-y divide-border/60">
				{#each visibleRows as row (row.key)}
					{@const scope = rowScope(row)}
					{@const modeRow = createStepModeRow(scope)}
					{@const status = lifecycleStatus(row.lifecycle)}
					<li
						{...modeAffordanceHooks(scope)}
						data-review-row={row.key}
						data-review-lifecycle={row.lifecycle}
						class={cn(
							"grid items-center gap-3.5 px-4 py-3.5",
							"grid-cols-[24px_1fr_auto_auto_auto_auto_auto]",
							"hover:bg-muted/40",
							row.lifecycle === "merged" && "opacity-65",
						)}
					>
						<!-- PR icon: OD `.ic` git-pull-request glyph. -->
						<span
							data-review-row-icon
							aria-hidden="true"
							class={cn(
								"text-sm",
								row.lifecycle === "merged" ? "text-success" : "text-primary",
							)}
						>
							⎇
						</span>

						<!-- Title + diff summary: OD `.title` / `.desc`. -->
						<div class="min-w-0">
							<div data-review-row-title class="truncate text-[13px] font-medium text-foreground">
								{row.title}
							</div>
							<div data-review-row-desc class="mt-0.5 font-mono text-[11px] text-muted-foreground">
								{row.key} · {row.diff}
							</div>
						</div>

						<!-- Four-dot check-row: OD `.check-row` lint/test/bench/a11y. -->
						<div class="inline-flex gap-1.5" data-review-row-checks aria-label="Pre-merge checks">
							{#each row.checks as check (check.name)}
								<span
									data-review-check={check.name}
									data-review-check-tone={check.tone}
									title={`${check.name}: ${check.tone}`}
									class={cn(
										"size-1.5 rounded-full",
										check.tone === "ok" && "bg-success",
										check.tone === "warn" && "bg-warning",
										check.tone === "danger" && "bg-destructive",
									)}
								>
									<span class="sr-only">{check.name} {check.tone}</span>
								</span>
							{/each}
						</div>

						<!-- Stacked reviewer avatars: OD `.reviewers` / `.avatar`. -->
						<div class="flex" data-review-row-reviewers aria-label="Reviewers">
							{#each row.reviewers as reviewer, index (reviewer.id)}
								<Avatar
									size="xs"
									data-review-reviewer={reviewer.id}
									aria-label={reviewer.name}
									class={cn(
										"border-2 border-background",
										index > 0 && "-ml-1.5",
									)}
								>
									<AvatarFallback class="bg-primary/20 text-[10px] text-primary">
										{monogram(reviewer.name)}
									</AvatarFallback>
								</Avatar>
							{/each}
						</div>

						<!-- Canonical status badge: `COPY.md` §362 8-state vocab. -->
						<StatusBadge {status} data-review-row-status />

						<!-- Relative age: OD `.meta`. -->
						<span data-review-row-age class="font-mono text-[11px] text-muted-foreground">
							{row.age}
						</span>

						<!--
							Compact per-Step mode row: OD `.mode-row.compact`. The universal
							ModeAffordance (`prd-web-mode-affordance-system`); `⊞ AI Assist`
							opens the one shell drawer (`prd-web-global-ai-assist-drawer`).
						-->
						<ModeRow {...modeRow} data-review-row-mode />
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
