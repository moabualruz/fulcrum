<script lang="ts">
	/**
	 * `/<ws>/projects/<projId>/plan/prototypes`: the Plan-stage prototype
	 * gallery (`prd-web-plan-prototypes-od-fidelity`; OD `plan-prototypes.html`;
	 * IA-MAP.md §2.2 "prototype callout(s)" / §3 `:prototype` "prototype gallery ·
	 * live + archived"; CLI-TUI-UX.md §1.2 `fulcrum prototype new|view|attach`;
	 * COPY.md §2 plan-prototypes empty state; DESIGN.md §4.11/§4.13 mode row).
	 *
	 * A prototype is a Plan output: a throwaway scaffold attached to a plan. It
	 * lives only until the plan ships, then auto-archives. The OD frame renders
	 * this as a responsive card grid:
	 *
	 *   ┌ canvas: 16:10 thumbnail, dashed inner frame, kind glyph + screen line ┐
	 *   ├ body  : title · monospace meta (plan_id · screens · last edit)        │
	 *   │          footer: live/archived badge · "embedded in plan review" ·    │
	 *   │                   Open / Duplicate (live) or Restore (archived)        │
	 *   └          mode-row: Manual / Play / Discuss / AI Assist                ┘
	 *
	 * Each card's Open action opens the live preview embedded in the
	 * `plan-review.html` pane-2 prototype callout: the gallery and the review
	 * tripane (`prd-web-plan-review-od-fidelity`) share the prototype-preview
	 * seam. Archived cards are dimmed + grayscaled; Restore moves an archived
	 * prototype back to live.
	 *
	 * The route name previously held an artifact inspector (`Artifact kind
	 * prototype/boilerplate/test`, `inspectArtifact`, an `auditEntries` log,
	 * approve/changes-requested actions). The `boilerplate`/`test` artifact-kinds
	 * and the artifact-detail/audit-inspector shape belong to the Ship cluster
	 * (`fulcrum artifact list|view|diff|export`, IA-MAP.md §3); that disposition
	 * is recorded in `design-alignment/ship.md` under the Ship `artifacts`
	 * surface: no feature loss, artifact inspection survives under Ship. This
	 * file rebuilds `plan-prototypes` as the genuine OD prototype-kind card
	 * gallery.
	 *
	 * Composes `@fulcrum/ui-kit` primitives only: `Badge`, `Button`, `Card`,
	 * `EmptyState`, `ModeRow`: never re-implements a primitive (AGENTS.md
	 * ui-kit rule). The OD shell chrome (StageRail / ScopeBar / StatusFooter /
	 * AcpDrawer) is provided by the root `+layout.svelte`.
	 */
	import { Badge, Button, Card, EmptyState, ModeRow } from "@fulcrum/ui-kit";
	import type { WorkflowMode } from "@fulcrum/ui-kit";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";

	/**
	 * A throwaway prototype attached to a plan. `live` while the plan is open;
	 * `archived` once the plan ships (the auto-archive rule) or on manual
	 * archive. Archived prototypes render dimmed + grayscaled.
	 */
	type Prototype = {
		/** Stable prototype id: the per-card `data-prototype` token. */
		id: string;
		/** Card title. */
		title: string;
		/** Owning plan id, surfaced in the monospace meta line. */
		planId: string;
		/** Kind glyph + scope shown inside the 16:10 canvas stub. */
		canvasLabel: string;
		/** Monospace meta: `plan_id · N screens · last edit …` (OD `.meta`). */
		meta: string;
		/** Lifecycle state: drives the live/archived badge and the dim/gray. */
		state: "live" | "archived";
		/** The currently-selected per-card mode (DESIGN.md §4.13 ModeRow). */
		mode: WorkflowMode;
	};

	/**
	 * Seed prototypes: two live, one archived, matching the OD frame. In
	 * production this list is the `fulcrum prototype` data path scoped to the
	 * active `(workspace, project, plan)`; the route owns zero persistence.
	 */
	const SEED_PROTOTYPES: ReadonlyArray<Prototype> = [
		{
			id: "proto-offline-token-refresh",
			title: "Offline-first token refresh",
			planId: "plan_8f29a4c",
			canvasLabel: "auth flow · 3 screens",
			meta: "plan_8f29a4c · 3 screens · last edit 1h ago",
			state: "live",
			mode: "manual",
		},
		{
			id: "proto-trace-stitch",
			title: "Cross-surface trace stitch",
			planId: "plan_3d18e92",
			canvasLabel: "trace explorer · 2 panes",
			meta: "plan_3d18e92 · 2 panes · last edit 3h ago",
			state: "live",
			mode: "manual",
		},
		{
			id: "proto-board-variant",
			title: "Plane-style board variant",
			planId: "plan_447b21c",
			canvasLabel: "board layout · archived",
			meta: "plan_447b21c · archived 12d ago",
			state: "archived",
			mode: "manual",
		},
	] as const;

	/**
	 * The `?state=empty` query param forces the zero-data branch so the
	 * design-e2e empty-state contract can render it without interaction. It is
	 * read once at component init: both during SSR and on the client, so the
	 * hydrated markup matches: and never re-forced: the empty branch the user
	 * then leaves (e.g. via "Start planning") stays populated.
	 */
	const startEmpty = page.url.searchParams.get("state") === "empty";

	let prototypes = $state<Prototype[]>(
		startEmpty ? [] : SEED_PROTOTYPES.map((p) => ({ ...p })),
	);

	/** Live + archived partitions: drive the `N live · M archived` count. */
	const liveCount = $derived(prototypes.filter((p) => p.state === "live").length);
	const archivedCount = $derived(prototypes.filter((p) => p.state === "archived").length);
	/** The gallery is empty only when no prototype: live or archived: exists. */
	const isEmpty = $derived(prototypes.length === 0);

	/**
	 * Open a prototype's live preview embedded in the plan-review pane-2
	 * prototype callout. Navigating to the plan-review route: the surface that
	 * owns the embedded prototype-preview frame (`prd-web-plan-review-od-fidelity`,
	 * `data-prototype-pane`): is the OD "embedded in plan review" handoff. The
	 * prototype id rides along as a query param so the review tripane can scope
	 * its callout (interaction_assertion 1).
	 */
	function openInReview(prototype: Prototype): void {
		void goto(`/plan-review?prototype=${encodeURIComponent(prototype.id)}`);
	}

	/** Duplicate a live prototype: a new live scaffold seeded from this one. */
	function duplicate(prototype: Prototype): void {
		const copy: Prototype = {
			...prototype,
			id: `${prototype.id}-copy-${prototypes.length + 1}`,
			title: `${prototype.title} (copy)`,
			meta: `${prototype.planId} · duplicated just now`,
			state: "live",
			mode: "manual",
		};
		const index = prototypes.findIndex((p) => p.id === prototype.id);
		prototypes = [
			...prototypes.slice(0, index + 1),
			copy,
			...prototypes.slice(index + 1),
		];
	}

	/** Restore an archived prototype back to live (interaction_assertion 2). */
	function restore(prototype: Prototype): void {
		prototypes = prototypes.map((p) =>
			p.id === prototype.id
				? { ...p, state: "live", meta: `${p.planId} · restored just now` }
				: p,
		);
	}

	/** Select a per-card mode: the universal Step ModeAffordance. */
	function selectMode(prototype: Prototype, mode: WorkflowMode): void {
		prototypes = prototypes.map((p) => (p.id === prototype.id ? { ...p, mode } : p));
	}

	/** Re-seed the gallery: the empty-state "Start planning" recovery action. */
	function startPlanning(): void {
		prototypes = SEED_PROTOTYPES.map((p) => ({ ...p }));
	}
</script>

<svelte:head>
	<title>Plan · Prototypes | Fulcrum</title>
</svelte:head>

<!--
	The OD `plan-prototypes.html` gallery: a page head with the prototype count,
	a subtitle explaining the throwaway lifecycle, then a responsive card grid
	(or the COPY.md §2 empty state). `data-state` exposes the populated / empty
	branch to design-e2e.
-->
<main
	data-route="plan-prototypes"
	data-stage="plan"
	data-plan-prototypes-page
	data-state={isEmpty ? "empty" : "populated"}
	class="mx-auto flex w-full max-w-5xl flex-col gap-1 px-6 py-6 pb-20"
>
	<div class="flex flex-wrap items-baseline gap-4">
		<h1 class="text-[1.375rem] font-semibold tracking-tight text-foreground">Prototypes</h1>
		<span class="font-mono text-xs text-muted-foreground" data-prototype-count>
			{liveCount} live · {archivedCount} archived
		</span>
	</div>
	<p class="mt-2 max-w-3xl text-xs text-muted-foreground">
		Throwaway scaffolds attached to a plan. Lives only until the plan ships. Click any prototype to
		open the live preview embedded in the plan-review tripane.
	</p>

	{#if isEmpty}
		<!--
			COPY.md §2 plan-prototypes worked example: verbatim H2 + paragraph +
			the one-primary-plus-one-ghost action pair. This is the source of truth;
			the OD inline copy ("Throwaway scaffolds attach to a plan…") diverges
			and is reconciled to the COPY.md text here (copy_assertion 1).
		-->
		<EmptyState
			data-plan-prototypes-empty
			class="mt-6"
			title="No prototypes yet."
			description="Prototypes appear when a planning session ships a draft. Start one to seed this list."
		>
			{#snippet actions()}
				<Button size="sm" data-empty-start-planning onclick={startPlanning}>
					Start planning
				</Button>
				<Button size="sm" variant="ghost" href="/plan-templates" data-empty-open-templates>
					Open templates
				</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<!--
			The responsive card grid: `auto-fill minmax(20rem, 1fr)` matches the OD
			`.proto-grid`. Each card carries `data-prototype` + `data-prototype-state`
			so design-e2e can assert the live/archived partition.
		-->
		<div
			data-prototype-grid
			class="mt-5 grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(20rem,1fr))]"
		>
			{#each prototypes as prototype (prototype.id)}
				{@const archived = prototype.state === "archived"}
				<Card
					data-prototype={prototype.id}
					data-prototype-state={prototype.state}
					class="flex flex-col gap-0 overflow-hidden p-0 {archived ? 'opacity-70' : ''}"
				>
					<!-- 16:10 canvas thumbnail with the dashed inner frame + kind stub. -->
					<div
						data-prototype-canvas
						class="relative grid aspect-[16/10] place-items-center border-b border-border bg-gradient-to-br from-primary/[0.08] to-muted text-muted-foreground {archived
							? 'grayscale'
							: ''}"
					>
						<span
							aria-hidden="true"
							class="pointer-events-none absolute inset-4 rounded-sm border border-dashed border-primary/25"
						></span>
						<div class="z-[1] flex flex-col items-center gap-2">
							<span aria-hidden="true" class="text-2xl text-primary/60">
								{archived ? "▦" : "◫"}
							</span>
							<span class="font-mono text-[11px]">{prototype.canvasLabel}</span>
						</div>
					</div>

					<div class="flex flex-col gap-2 p-3.5">
						<h3 class="text-[13px] font-semibold tracking-tight text-foreground">
							{prototype.title}
						</h3>
						<p class="font-mono text-[11px] text-muted-foreground" data-prototype-meta>
							{prototype.meta}
						</p>

						<!-- Footer: live/archived badge · note · Open/Duplicate/Restore. -->
						<div
							class="flex flex-wrap items-center gap-2 border-t border-border pt-2"
							data-prototype-footer
						>
							{#if archived}
								<Badge variant="outline" data-prototype-badge>archived</Badge>
							{:else}
								<Badge variant="success" data-prototype-badge>live</Badge>
								<span class="text-[11px] text-muted-foreground">embedded in plan review</span>
							{/if}
							<span class="flex-1"></span>
							{#if archived}
								<Button
									variant="outline"
									size="sm"
									data-prototype-restore
									onclick={() => restore(prototype)}
								>
									Restore
								</Button>
							{:else}
								<Button
									variant="outline"
									size="sm"
									data-prototype-open
									onclick={() => openInReview(prototype)}
								>
									Open
								</Button>
								<Button
									variant="ghost"
									size="sm"
									data-prototype-duplicate
									onclick={() => duplicate(prototype)}
								>
									Duplicate
								</Button>
							{/if}
						</div>

						<!--
							The universal per-Step mode affordance (DESIGN.md §4.13,
							`prd-web-mode-affordance-system`): every prototype card is a Step.
						-->
						<ModeRow
							value={prototype.mode}
							onSelect={(mode) => selectMode(prototype, mode)}
							ariaLabel="Step modes"
							data-prototype-mode-row
						/>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</main>
