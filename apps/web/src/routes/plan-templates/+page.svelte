<script lang="ts">
	/**
	 * `/<ws>/projects/<projId>/plan/templates`: the Plan-stage **plan-template
	 * library** (`prd-web-plan-templates-od-fidelity`; OD `plan-templates.html`;
	 * IA-MAP.md §3 `:templates`; CLI-TUI-UX.md §1 "Plan template library";
	 * COPY.md §2 templates empty state; DESIGN.md §4.11 per-step mode row).
	 *
	 * The OD prototype renders the plan-template library as a two-column `.lib`
	 * grid: a 220px left sidebar with **Category** facets (All / Refactor / New
	 * feature / Bug investigation / Migration / Spike-prototype) and **Owner**
	 * facets (Mine / Team), beside a responsive card grid. Each card carries an
	 * icon tile, a title, a one-line description naming the template skeleton,
	 * monospace meta (`used 7× · updated 3d ago`), and a per-card four-mode row.
	 *
	 * Before this build no `plan-templates` route existed on web: the surface
	 * was entirely unbuilt (PRD `current_evidence`). This file is the rendered
	 * fidelity target; `prd-web-stage-route-model` resolves the legacy/canonical
	 * route segments and `prd-web-mode-affordance-system` owns the ModeRow shell.
	 *
	 * **Disambiguation (AGENTS.md responsibility-first names):** a *plan template*
	 * is a seed plan structure (prompt + approach skeleton + acceptance
	 * checklist). It is NOT the task/recurrence `templates` feature reachable from
	 * CLI root help. The two never collide: this surface is keyed
	 * `data-route="plan-templates"` / `data-template-kind="plan-template"` and is
	 * the cold-start branch of the COPY.md §2 "Plan (no sessions yet)" empty
	 * state: picking a template seeds a new planning session, it does not create
	 * a recurring task shape.
	 *
	 * Composes `@fulcrum/ui-kit` primitives only: `Badge`, `Button`, `Card`,
	 * `Chip`, `EmptyState`, `ModeRow`: never re-implements a primitive
	 * (AGENTS.md ui-kit rule). The OD shell chrome (StageRail / ScopeBar /
	 * StatusFooter / AcpDrawer) is provided by the root `+layout.svelte`; this
	 * route renders the template-library page only.
 */
	import type { WorkflowMode } from "@fulcrum/shared-dto";
	import {
		Badge,
		Button,
		Card,
		Chip,
		EmptyState,
		ModeRow,
	} from "@fulcrum/ui-kit";

	/** A Category facet: the OD sidebar's first facet group. */
	type Category =
		| "all"
		| "refactor"
		| "new-feature"
		| "bug-investigation"
		| "migration"
		| "spike-prototype";

	/** An Owner facet: the OD sidebar's second facet group. */
	type Owner = "mine" | "team";

	/**
	 * One plan template: a seed plan structure. `category` keys the Category
	 * facet; `owner` keys the Owner facet; `mode` is the per-card ModeRow value.
	 */
	type PlanTemplate = {
		id: string;
		title: string;
		/** One-line description naming the plan skeleton (prompt / approach / acceptance). */
		description: string;
		/** OD monospace icon-tile glyph key. */
		icon: string;
		category: Exclude<Category, "all">;
		owner: Owner;
		usedCount: number;
		updatedAgo: string;
		/** Per-card ModeRow selection: Manual is the OD default (`aria-pressed`). */
		mode: WorkflowMode;
	};

	/**
	 * The 12 seed plan templates: the OD `plan-templates.html` card grid plus
	 * the four templates implied by its `12 templates` count and the Category
	 * facet tallies (Refactor 4 / New feature 3 / Bug investigation 2 /
	 * Migration 2 / Spike-prototype 1). Each description names the skeleton the
	 * template seeds, not a feature label (responsibility-first copy).
	 */
	const INITIAL_TEMPLATES: PlanTemplate[] = [
		{
			id: "tpl_refactor_module",
			title: "Refactor a module",
			description:
				"Boundary survey → atomic step plan → acceptance checklist. Uses dependency graph.",
			icon: "⟲",
			category: "refactor",
			owner: "team",
			usedCount: 7,
			updatedAgo: "3d ago",
			mode: "manual",
		},
		{
			id: "tpl_new_feature_spec",
			title: "New feature spec",
			description:
				"Problem → why now → approach → tasks → rollout. Mandatory acceptance gate.",
			icon: "✦",
			category: "new-feature",
			owner: "team",
			usedCount: 4,
			updatedAgo: "5d ago",
			mode: "manual",
		},
		{
			id: "tpl_bug_investigation",
			title: "Bug investigation",
			description:
				"Repro → minimization → hypothesis → fix → regression test. Trace-anchored.",
			icon: "△",
			category: "bug-investigation",
			owner: "mine",
			usedCount: 11,
			updatedAgo: "yesterday",
			mode: "manual",
		},
		{
			id: "tpl_schema_migration",
			title: "Schema migration",
			description:
				"Pre-flight check, additive change, backfill, cutover, rollback strategy.",
			icon: "▤",
			category: "migration",
			owner: "team",
			usedCount: 2,
			updatedAgo: "12d ago",
			mode: "manual",
		},
		{
			id: "tpl_spike_prototype",
			title: "Spike / prototype",
			description:
				"Hypothesis → throwaway scaffold → measurement → ship or revert. Time-boxed.",
			icon: "⚗",
			category: "spike-prototype",
			owner: "mine",
			usedCount: 3,
			updatedAgo: "8d ago",
			mode: "manual",
		},
		{
			id: "tpl_security_review",
			title: "Security review",
			description:
				"Surface map → STRIDE → mitigations → acceptance. Auto-pings security@.",
			icon: "⛉",
			category: "new-feature",
			owner: "team",
			usedCount: 1,
			updatedAgo: "21d ago",
			mode: "manual",
		},
		{
			id: "tpl_performance_investigation",
			title: "Performance investigation",
			description:
				"Baseline → flame graph → hypothesis → diff → benchmark gate.",
			icon: "◉",
			category: "bug-investigation",
			owner: "mine",
			usedCount: 2,
			updatedAgo: "14d ago",
			mode: "manual",
		},
		{
			id: "tpl_library_upgrade",
			title: "Library upgrade",
			description: "Diff scan → blast radius → upgrade in branch → run smoke suite.",
			icon: "▣",
			category: "migration",
			owner: "team",
			usedCount: 5,
			updatedAgo: "4d ago",
			mode: "manual",
		},
		{
			id: "tpl_extract_service",
			title: "Extract a service",
			description:
				"Seam map → carve bounded context → wire contracts → split package.",
			icon: "⟲",
			category: "refactor",
			owner: "team",
			usedCount: 6,
			updatedAgo: "6d ago",
			mode: "manual",
		},
		{
			id: "tpl_dependency_consolidation",
			title: "Dependency consolidation",
			description:
				"Inventory duplicates → pick one per responsibility → migrate callers.",
			icon: "⟲",
			category: "refactor",
			owner: "mine",
			usedCount: 3,
			updatedAgo: "9d ago",
			mode: "manual",
		},
		{
			id: "tpl_split_module",
			title: "Split an oversized module",
			description:
				"Complexity scan → responsibility groups → atomic moves → re-test.",
			icon: "⟲",
			category: "refactor",
			owner: "mine",
			usedCount: 4,
			updatedAgo: "10d ago",
			mode: "manual",
		},
		{
			id: "tpl_feature_flag_rollout",
			title: "Feature flag rollout",
			description:
				"Flag scaffold → guarded surface → staged ramp → cleanup task.",
			icon: "✦",
			category: "new-feature",
			owner: "team",
			usedCount: 8,
			updatedAgo: "2d ago",
			mode: "manual",
		},
	];

	/**
	 * Category facets, in OD sidebar order. `all` is the unfaceted default; the
	 * counts are derived live so faceting and the sidebar stay in sync.
	 */
	const CATEGORY_FACETS: ReadonlyArray<{ key: Category; label: string }> = [
		{ key: "all", label: "All" },
		{ key: "refactor", label: "Refactor" },
		{ key: "new-feature", label: "New feature" },
		{ key: "bug-investigation", label: "Bug investigation" },
		{ key: "migration", label: "Migration" },
		{ key: "spike-prototype", label: "Spike / prototype" },
	] as const;

	/** Owner facets, in OD sidebar order. */
	const OWNER_FACETS: ReadonlyArray<{ key: Owner; label: string }> = [
		{ key: "mine", label: "Mine" },
		{ key: "team", label: "Team" },
	] as const;

	let templates = $state<PlanTemplate[]>(INITIAL_TEMPLATES);
	let activeCategory = $state<Category>("all");
	/** `null` = no Owner facet applied (the OD default: neither Mine nor Team active). */
	let activeOwner = $state<Owner | null>(null);
	/** The template selected for create-from-template confirmation. */
	let pendingTemplateId = $state<string | null>(null);
	/** The seeded planning session, set once create-from-template confirms. */
	let seededSession = $state<{ templateTitle: string; sessionId: string } | null>(null);

	/** Templates after the active Category + Owner facets: the OD card grid. */
	const visibleTemplates = $derived(
		templates.filter(
			(t) =>
				(activeCategory === "all" || t.category === activeCategory) &&
				(activeOwner === null || t.owner === activeOwner),
		),
	);

	/** Live Category counts: drives the OD sidebar `.count` chips. */
	function categoryCount(key: Category): number {
		return key === "all"
			? templates.length
			: templates.filter((t) => t.category === key).length;
	}

	/** Live Owner counts: drives the OD sidebar `.count` chips. */
	function ownerCount(key: Owner): number {
		return templates.filter((t) => t.owner === key).length;
	}

	/** Used-this-week tally for the OD page-head count line. */
	const usedThisWeek = $derived(templates.filter((t) => t.usedCount > 0 && t.usedCount <= 9).length);

	const isEmpty = $derived(templates.length === 0);
	const pendingTemplate = $derived(
		templates.find((t) => t.id === pendingTemplateId) ?? null,
	);

	/** Apply a Category facet: narrows the card grid (OD sidebar `.item.active`). */
	function pickCategory(key: Category): void {
		activeCategory = key;
	}

	/** Toggle an Owner facet: clicking the active one clears it (OD two-state). */
	function pickOwner(key: Owner): void {
		activeOwner = activeOwner === key ? null : key;
	}

	/** Stage a template for the create-from-template confirmation step. */
	function selectTemplate(id: string): void {
		pendingTemplateId = id;
		seededSession = null;
	}

	/** Update a card's ModeRow selection. */
	function setMode(id: string, mode: WorkflowMode): void {
		templates = templates.map((t) => (t.id === id ? { ...t, mode } : t));
	}

	/**
	 * Confirm create-from-template: seeds a new planning session from the
	 * staged template. This is the cold-start branch of COPY.md §2 "Plan (no
	 * sessions yet)": the seeded session id is the handoff the `plan-session`
	 * New-session path receives (PRD acceptance: "seeds a new planning session
	 * via the plan-session New-session path").
	 */
	function createFromTemplate(): void {
		if (!pendingTemplate) return;
		const seed = pendingTemplate;
		templates = templates.map((t) =>
			t.id === seed.id ? { ...t, usedCount: t.usedCount + 1, updatedAgo: "just now" } : t,
		);
		seededSession = {
			templateTitle: seed.title,
			sessionId: `plan_sess_${seed.id.replace(/^tpl_/, "")}`,
		};
		pendingTemplateId = null;
	}

	/** Dismiss the create-from-template confirmation without seeding. */
	function cancelCreate(): void {
		pendingTemplateId = null;
	}

	/** Empty the library: drives the COPY.md §2 templates empty state. */
	function clearTemplates(): void {
		templates = [];
		pendingTemplateId = null;
		seededSession = null;
	}

	/** Re-seed the library: the empty-state "New template" action. */
	function restoreTemplates(): void {
		templates = INITIAL_TEMPLATES;
		activeCategory = "all";
		activeOwner = null;
	}
</script>

<svelte:head>
	<title>Plan templates | Fulcrum</title>
</svelte:head>

<!--
	The OD `plan-templates.html` page: a head row + subtitle, then the `.lib`
	two-column grid: a 220px Category/Owner facet sidebar beside the template
	card grid. `data-state` exposes the populated / empty branch to design-e2e
	(DESIGN.md §4.15 empty-state pattern).
-->
<section
	data-route="plan-templates"
	data-stage="plan"
	data-template-kind="plan-template"
	data-plan-templates-page
	data-state={isEmpty ? "empty" : "populated"}
	class="grid gap-4"
>
	<!-- ── Page head: title + count + New template action ──────────────── -->
	<header class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
		<h1 class="text-xl font-semibold tracking-tight text-foreground">Plan templates</h1>
		<span class="font-mono text-xs text-muted-foreground" data-templates-count>
			{templates.length} templates · {usedThisWeek} used this week
		</span>
		<div class="ml-auto">
			<Button size="sm" data-new-template onclick={restoreTemplates}>+ New template</Button>
		</div>
	</header>
	<p class="max-w-2xl text-sm leading-6 text-muted-foreground">
		Templates are seed structures for new plans. Pick one to skip the cold start:
		prompt, approach skeleton, acceptance checklist.
	</p>

	{#if seededSession}
		<!--
			Create-from-template result: the seeded planning session handoff.
			A `data-seeded-session` panel so design-e2e proves the interaction
			assertion "selecting a template and confirming opens a pre-seeded
			planning session".
		-->
		<Card
			class="flex flex-wrap items-center gap-3 border-success/40 bg-success/5 p-3"
			data-seeded-session={seededSession.sessionId}
		>
			<Chip tone="success">Planning session seeded</Chip>
			<span class="text-sm text-foreground">
				<strong>{seededSession.templateTitle}</strong> seeded a new planning session.
			</span>
			<a
				class="ml-auto inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 font-mono text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				href={`/plan-session#${seededSession.sessionId}`}
				data-open-seeded-session
			>
				Open {seededSession.sessionId}
			</a>
		</Card>
	{/if}

	{#if isEmpty}
		<!--
			COPY.md §2 canonical empty-state shape: H2 (what's missing) + P (why
			+ next step) + two action buttons. The templates surface has no
			worked example in COPY.md §2; the copy follows the canonical shape
			and the OD `data-empty-for="templates"` block verbatim, which is the
			source of truth for this specific surface (design-alignment/plan.md
			§plan-templates.html "OD's `data-empty-for=templates` block … is
			template-faithful").
		-->
		<EmptyState
			data-plan-templates-empty
			title="No templates yet."
			description="Templates are reusable plan skeletons. Save a plan as a template to populate this list."
		>
			{#snippet actions()}
				<Button size="sm" data-empty-new-template onclick={restoreTemplates}>
					+ New template
				</Button>
				<Button size="sm" variant="secondary" data-empty-import-preset onclick={restoreTemplates}>
					Import preset
				</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<!-- ── The OD `.lib` two-column grid: facet sidebar + card grid ──── -->
		<div class="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
			<!-- Column 1: Category + Owner facet sidebar (OD `.side`). -->
			<aside
				data-slot="template-facets"
				data-template-facets
				aria-label="Template facets"
				class="grid h-max content-start gap-1 border-b border-border pb-4 lg:border-r lg:border-b-0 lg:pr-4"
			>
				<h2 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
					Category
				</h2>
				{#each CATEGORY_FACETS as facet (facet.key)}
					<button
						type="button"
						data-category-facet={facet.key}
						data-active={activeCategory === facet.key ? "true" : undefined}
						aria-pressed={activeCategory === facet.key}
						class="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {activeCategory ===
						facet.key
							? 'bg-primary/10 font-medium text-primary'
							: 'text-muted-foreground hover:bg-muted'}"
						onclick={() => pickCategory(facet.key)}
					>
						<span>{facet.label}</span>
						<span class="ml-auto font-mono text-[10px] text-muted-foreground">
							{categoryCount(facet.key)}
						</span>
					</button>
				{/each}

				<h2
					class="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
				>
					Owner
				</h2>
				{#each OWNER_FACETS as facet (facet.key)}
					<button
						type="button"
						data-owner-facet={facet.key}
						data-active={activeOwner === facet.key ? "true" : undefined}
						aria-pressed={activeOwner === facet.key}
						class="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {activeOwner ===
						facet.key
							? 'bg-primary/10 font-medium text-primary'
							: 'text-muted-foreground hover:bg-muted'}"
						onclick={() => pickOwner(facet.key)}
					>
						<span>{facet.label}</span>
						<span class="ml-auto font-mono text-[10px] text-muted-foreground">
							{ownerCount(facet.key)}
						</span>
					</button>
				{/each}
			</aside>

			<!-- Column 2: the responsive template card grid (OD `.grid`). -->
			<div
				data-slot="template-grid"
				data-template-grid
				class="grid grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))] gap-3"
			>
				{#each visibleTemplates as tpl (tpl.id)}
					<Card
						class="flex flex-col gap-2 p-3.5 transition-colors hover:border-primary"
						data-template-card={tpl.id}
						data-template-category={tpl.category}
						data-template-owner={tpl.owner}
					>
						<!-- Icon tile: OD `.ic-wrap`. -->
						<span
							data-slot="template-icon"
							aria-hidden="true"
							class="inline-grid size-7 place-items-center rounded-md bg-primary/10 text-sm text-primary"
						>
							{tpl.icon}
						</span>
						<h3 class="text-[13px] font-semibold tracking-tight text-foreground">
							{tpl.title}
						</h3>
						<p class="text-[11px] leading-relaxed text-muted-foreground">{tpl.description}</p>

						<!-- Monospace meta: OD `.meta` (`used N× · updated …`). -->
						<div
							data-slot="template-meta"
							class="flex gap-2 border-t border-border/60 pt-2 font-mono text-[10px] text-muted-foreground"
						>
							<span data-template-used>used {tpl.usedCount}×</span>
							<span aria-hidden="true">•</span>
							<span>updated {tpl.updatedAgo}</span>
						</div>

						<!-- Per-card mode row: DESIGN.md §4.11 / §4.13 universal affordance. -->
						<ModeRow
							class="mt-1 w-max"
							density="compact"
							value={tpl.mode}
							data-template-mode-row={tpl.id}
							onSelect={(mode) => setMode(tpl.id, mode)}
						/>

						<!-- Create-from-template: staged confirm, then seeded session. -->
						{#if pendingTemplateId === tpl.id}
							<div
								class="grid gap-2 rounded-md border border-primary/40 bg-primary/5 p-2.5"
								data-template-confirm={tpl.id}
							>
								<p class="text-[11px] text-foreground">
									Create a planning session from <strong>{tpl.title}</strong>?
								</p>
								<div class="flex flex-wrap gap-2">
									<Button
										size="sm"
										data-confirm-create-template={tpl.id}
										onclick={createFromTemplate}
									>
										Use template
									</Button>
									<Button
										size="sm"
										variant="ghost"
										data-cancel-create-template
										onclick={cancelCreate}
									>
										Cancel
									</Button>
								</div>
							</div>
						{:else}
							<Button
								size="sm"
								variant="secondary"
								class="mt-1 w-max"
								data-use-template={tpl.id}
								onclick={() => selectTemplate(tpl.id)}
							>
								Create from template
							</Button>
						{/if}
					</Card>
				{/each}

				{#if visibleTemplates.length === 0}
					<!-- Facet-narrowed-to-nothing: not a zero-data empty state. -->
					<div
						data-template-facet-empty
						class="col-span-full rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
					>
						No templates match this facet.
						<Badge variant="secondary" class="ml-1">{activeCategory}</Badge>
					</div>
				{/if}
			</div>
		</div>

		<!-- Demo affordance: empties the library to exercise the empty state. -->
		<div>
			<Button
				size="sm"
				variant="ghost"
				data-clear-templates
				onclick={clearTemplates}
			>
				Clear templates
			</Button>
		</div>
	{/if}
</section>
