<script lang="ts">
	/**
	 * CaptureStageWorkbench: the Capture WorkflowStage workbench
	 * (`prd-web-capture-stage-shell`; IA-MAP.md §2.1; OD `capture.html`,
	 * `capture-drafts.html`, `capture-promoted.html`).
	 *
	 * Rendered by `/<ws>/projects/<projId>/capture`. The OD prototype renders
	 * the Capture stage as one stage shell with four sub-views: Docs (tree +
	 * editor), Drafts, Promoted, Inbox. Each is a `?view=` projection of the
	 * single Capture stage so a sub-view never becomes a standalone route
	 * (migration-strategy.md "mobile-* / preview routes become states").
	 *
	 * Every Capture Step row carries the universal `ModeAffordance`: the
	 * `@fulcrum/ui-kit` `ModeRow` primitive via `mode-affordance-host`: because
	 * DESIGN.md §4.13 makes a Capture block a Step. Empty states render the
	 * locked COPY.md §2 strings through the `@fulcrum/ui-kit` `EmptyState`
	 * primitive (one sentence + one action).
	 *
	 * This component composes ui-kit primitives only (Button, Badge, ModeRow,
	 * EmptyState): it never re-implements a primitive, per the AGENTS.md
	 * ui-kit rule.
	 */
	import { Badge, Button, EmptyState, ModeRow } from "@fulcrum/ui-kit";

	import {
		CAPTURE_EMPTY_COPY,
		CAPTURE_ONBOARDING_COPY,
		CAPTURE_VIEWS,
		captureViewEntry,
		captureHandoffToPlan,
		type CaptureStep,
		type CaptureView,
	} from "./capture-stage.ts";
	import { createStepModeRow, modeAffordanceHooks } from "./mode-affordance-host.ts";
	import { stageRoute } from "./route-map.ts";
	import { cn } from "$lib/utils.js";

	interface Props {
		/** Workspace slug: for the sub-view tab `href`s. */
		ws: string;
		/** Project id: for the sub-view tab `href`s. */
		projId: string;
		/** The active Capture sub-view. */
		view: CaptureView;
		/** Capture Step rows for the active sub-view (drafts / promoted / inbox / docs). */
		steps: readonly CaptureStep[];
		/** Active trace id: carried into the Plan handoff. */
		traceId?: string | null;
	}

	let { ws, projId, view, steps, traceId = null }: Props = $props();

	const activeEntry = $derived(captureViewEntry(view));
	const emptyCopy = $derived(CAPTURE_EMPTY_COPY[view]);
	const isEmpty = $derived(steps.length === 0);

	/** Build a `?view=` href for a Capture sub-view, preserving the trace hash. */
	function viewHref(target: CaptureView): string {
		return `${stageRoute(ws, projId, "capture")}?view=${target}`;
	}

	/** The Capture → Plan handoff href: preserves the trace identity (IA-MAP §2.1). */
	const handoffHref = $derived(
		captureHandoffToPlan(stageRoute(ws, projId, "plan"), traceId),
	);

	/** A per-Step ModeRow binding: the universal Capture-block mode affordance. */
	function modeRowFor(step: CaptureStep) {
		return createStepModeRow({ stepId: step.id, kind: "doc-block", traceId: traceId ?? undefined, title: step.title });
	}
</script>

<!--
	`/<ws>/projects/<projId>/capture`: the Capture stage workbench. `data-route`
	and `data-stage` keep the StageRail / ScopeBar chrome synced to the route
	(the route-resolution crawl asserts both).
-->
<section
	data-route="ws-stage"
	data-stage="capture"
	data-capture-view={view}
	class="grid gap-4"
	style:padding-bottom="calc(env(safe-area-inset-bottom) + 4rem)"
>
	<header
		data-slot="capture-head"
		class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-sm border border-border bg-surface px-4 py-3"
	>
		<div class="grid gap-1">
			<h1 class="text-lg font-semibold text-fg">{activeEntry.label}</h1>
			<p class="text-sm text-fg-subtle">{activeEntry.purpose}</p>
		</div>
		<div class="flex items-center gap-2">
			<Badge data-slot="capture-count">{steps.length} captures</Badge>
			<div
				role="group"
				aria-label="Block actions"
				data-slot="capture-block-actions"
				data-safe-area-reserve="bottom"
				class="fixed inset-x-3 bottom-[calc(4rem+var(--fulcrum-gesture-zone-bottom)+0.75rem)] z-20 flex justify-center gap-1 rounded-sm border border-border bg-surface/95 p-1 shadow-sm sm:static sm:inset-auto sm:bg-transparent sm:p-0 sm:shadow-none"
			>
				<Button size="sm" variant="ghost" data-block-action="write">Write</Button>
				<Button size="sm" variant="ghost" data-block-action="link">Link</Button>
				<Button size="sm" variant="ghost" data-block-action="promote">Promote</Button>
			</div>
			<!-- Hand off to Plan: preserves the trace identity (IA-MAP §2.1). -->
			<Button
				href={handoffHref}
				data-slot="capture-handoff-to-plan"
				data-handoff-trace={traceId ?? ""}
			>
				Hand off to Plan
			</Button>
		</div>
	</header>

	<!--
		Capture sub-view tab strip: Docs / Drafts / Promoted / Inbox. Each tab is
		a `?view=` projection of the single Capture stage, never a standalone
		route, and is a findable feature view of the stage (carries the shared
		`stage-view-card` slot: migration value-preservation item 4).
		`aria-current` marks the active sub-view for assistive tech.
	-->
	<nav data-slot="capture-view-strip" aria-label="Capture views" class="flex flex-wrap gap-1">
		{#each CAPTURE_VIEWS as entry (entry.view)}
			<a
				data-slot="stage-view-card"
				data-capture-view-tab="true"
				data-view-id={entry.view}
				href={viewHref(entry.view)}
				aria-current={entry.view === view ? "page" : undefined}
				class={cn(
					"rounded-sm border px-3 py-1.5 text-sm",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					entry.view === view
						? "border-accent bg-accent-subtle text-accent"
						: "border-border bg-surface text-fg-subtle hover:bg-surface-sunken",
				)}
			>
				{entry.label}
			</a>
		{/each}
	</nav>

	{#if isEmpty}
		<!--
			Empty state: the locked COPY.md §2 strings, one sentence + one action,
			rendered through the ui-kit `EmptyState` primitive. The first-capture
			onboarding prompt (COPY.md §7) is rendered beneath, no marketing H1.
		-->
		<EmptyState
			data-slot="capture-empty"
			data-empty-for={view}
			title={emptyCopy.title}
			description={emptyCopy.description}
			keyHint={emptyCopy.keyHint}
		>
			{#snippet actions()}
				<Button data-slot="capture-empty-primary">{emptyCopy.primaryAction}</Button>
				<Button variant="ghost" data-slot="capture-empty-secondary">
					{emptyCopy.secondaryAction}
				</Button>
			{/snippet}
		</EmptyState>

		<p data-slot="capture-onboarding-prompt" class="text-center text-sm text-fg-subtle">
			{CAPTURE_ONBOARDING_COPY.firstCapturePrompt}
		</p>
	{:else}
		<!--
			Capture Step rows. Each row carries the universal ModeAffordance: the
			ui-kit ModeRow via `mode-affordance-host`: because a Capture block is
			a Step (DESIGN.md §4.13). Promoted rows additionally show a stage pill
			and the downstream `→ plan_*` / `→ run_*` link.
		-->
		<ul data-slot="capture-step-list" class="grid gap-2">
			{#each steps as step (step.id)}
				{@const modeRow = modeRowFor(step)}
				<li
					{...modeAffordanceHooks({ stepId: step.id, kind: "doc-block" })}
					data-slot="capture-step"
					data-capture-step-id={step.id}
					class="grid gap-2 rounded-sm border border-border bg-surface px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
				>
					<div class="grid gap-1">
						<div class="flex items-center gap-2">
							{#if step.stagePill}
								<Badge
									data-slot="capture-stage-pill"
									data-stage-pill={step.stagePill}
								>
									{step.stagePill === "plan" ? "PLAN" : "BUILD"}
								</Badge>
							{/if}
							<span data-slot="capture-step-title" class="text-sm font-medium text-fg">
								{step.title}
							</span>
						</div>
						<span class="text-xs text-fg-subtle">{step.preview}</span>
						<span class="font-mono text-xs text-fg-muted">
							{step.meta}{#if step.downstream}&nbsp;·&nbsp;{step.downstream}{/if}
						</span>
					</div>
					<ModeRow
						density={modeRow.density}
						modes={modeRow.modes}
						ariaLabel={modeRow.ariaLabel}
						onSelect={modeRow.onSelect}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</section>
