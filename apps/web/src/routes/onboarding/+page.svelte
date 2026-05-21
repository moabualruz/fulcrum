<script lang="ts">
	/**
	 * `/onboarding`: the OD first-run flow (`prd-onboarding-web-first-run`).
	 *
	 * Proven against OD `onboarding.html`, DESIGN.md §11 (Onboarding · first-run),
	 * COPY.md §7 (Onboarding first-run copy), and IA-MAP.md `/onboarding`.
	 *
	 * DESIGN.md §11 is explicit: "No multi-step wizard. No tooltip carousel. The
	 * interface teaches itself." The first run is therefore not a stepper: it is
	 * a short worked path that lands the operator inside the Capture surface:
	 *
	 *   1. boot      → workspace-name input (single field, COPY §7).
	 *   2. project   → "What are you building?" prompt (COPY §7).
	 *   3. capture   → the Capture doc surface (`onboarding.html` `.doc`) with a
	 *                  `.scrim` dimming everything except one `.anchor` block, a
	 *                  first-▶-Play coachmark anchored to it (5-dot indicator,
	 *                  Skip tour / Got it: try Play), and the first trace ID
	 *                  pulsing once. DESIGN §11 steps 3–5.
	 *
	 * The Capture surface reproduces the OD `onboarding.html` body verbatim: the
	 * "What just happened" / "Try it on this line" / "What stays the same
	 * everywhere" blocks, the `2 min · onboarding · step 3 / 5` meta, the
	 * `capture · seedlings` eyebrow: and the `.anchor` block carries the
	 * universal four-mode `ModeRow` (`✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI
	 * Assist`, DESIGN.md §4.13). First ▶ Play dismisses the coachmark + scrim;
	 * "Skip tour" exits the same way. DESIGN.md §12 anti-references are honored -
	 * no hero illustration, no persistent welcome banner; the scrim + coachmark
	 * are removed after first Play and never re-appear (CONTEXT.md OnboardingFlow:
	 * "subsequent sessions never re-enter it").
	 *
	 * Composes `@fulcrum/ui-kit` primitives only: `Button`, `Card`, `Input`,
	 * `Kbd`, `ModeRow`, `TraceChip`: never re-implements a primitive (AGENTS.md
	 * ui-kit rule). The coachmark popover is a positioned `Card` (an existing
	 * primitive); no hand-rolled overlay component is added.
	 *
	 * The `?step=` query param forces a specific phase so the design-e2e
	 * contract can render `workspace` / `project` / `capture` directly; it
	 * mirrors hydrated markup and is never re-forced once the operator advances.
	 */
	import { Button, Card, Input, Kbd, ModeRow, TraceChip } from "@fulcrum/ui-kit";
	import type { WorkflowMode } from "@fulcrum/ui-kit";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";

	/** The three first-run phases. `capture` is the OD `onboarding.html` state. */
	type FirstRunPhase = "workspace" | "project" | "capture";

	/** The first-run trace: one trace stitches signup through Capture (DESIGN §11). */
	const FIRST_RUN_TRACE = "tr_onb_first_play_01";

	/**
	 * `?step=` lands the design-e2e contract on a specific phase. The empty
	 * data-state is the `workspace` phase (zero workspace yet); the populated
	 * data-state is the `capture` phase (the OD `onboarding.html` frame).
	 */
	const STEP_PARAM = page.url.searchParams.get("step");
	const initialPhase: FirstRunPhase =
		STEP_PARAM === "project" || STEP_PARAM === "capture" ? STEP_PARAM : "workspace";

	let phase = $state<FirstRunPhase>(initialPhase);
	let workspaceName = $state("");
	let projectPrompt = $state("");

	/** The coachmark + scrim are shown once, on the first capture phase. */
	let coachmarkOpen = $state(initialPhase === "capture");
	/** The first trace pulse fires once, when Capture first renders (DESIGN §11 step 5). */
	let tracePulsed = $state(false);
	/** Whichever mode the operator picks on the `.anchor` ModeRow. */
	let anchorMode = $state<WorkflowMode>("manual");

	const workspaceLabel = $derived(workspaceName.trim() || "local");

	/** Advance boot → project once a workspace name is committed (COPY §7). */
	function continueFromWorkspace(): void {
		phase = "project";
	}

	/** Advance project → capture; the OD `onboarding.html` first-run surface. */
	function createProject(): void {
		phase = "capture";
		// DESIGN §11 step 4–5: the coachmark + first trace pulse fire once Capture opens.
		coachmarkOpen = true;
		queueTracePulse();
	}

	/** DESIGN §11 step 5: the first trace ID surface pulses exactly once. */
	function queueTracePulse(): void {
		tracePulsed = false;
		requestAnimationFrame(() => {
			tracePulsed = true;
		});
	}

	$effect(() => {
		if (phase === "capture" && !tracePulsed) queueTracePulse();
	});

	/** First ▶ Play: dismiss the coachmark + scrim, then hand off to Plan. */
	function tryFirstPlay(): void {
		anchorMode = "play";
		dismissCoachmark();
		void goto("/plan-session");
	}

	/** "Skip tour" / Esc: exit the coachmark without re-entering it. */
	function dismissCoachmark(): void {
		coachmarkOpen = false;
	}

	/** Esc dismisses the coachmark: the OD coachmark documents `Esc` to stop. */
	function onKeydown(event: KeyboardEvent): void {
		if (event.key === "Escape" && coachmarkOpen) {
			event.preventDefault();
			dismissCoachmark();
		}
	}
</script>

<svelte:head>
	<title>Onboarding · first Play | Fulcrum</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<!--
	`data-onboarding-page` + `data-state` expose the design-e2e contract:
	`empty` = the workspace-name phase (no workspace yet), `populated` = the
	OD `onboarding.html` capture surface. `data-phase` carries the exact phase.
-->
<main
	data-onboarding-page
	data-state={phase === "capture" ? "populated" : "empty"}
	data-phase={phase}
	class="relative min-h-screen bg-background text-foreground"
>
	{#if phase === "workspace"}
		<!--
			DESIGN §11 step 1: the single workspace-name field. COPY §7 verbatim:
			"What's your workspace called?" / "Use anything. You can rename later.
			`local` works fine." / [ Continue ].
		-->
		<section
			class="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-6 py-12"
		>
			<div class="space-y-1">
				<p
					data-onboarding-eyebrow
					class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
				>
					first run · 1 of 2
				</p>
				<h1 data-onboarding-heading class="text-2xl font-semibold tracking-tight">
					What's your workspace called?
				</h1>
			</div>
			<Card class="flex flex-col gap-4 p-5">
				<form
					class="flex flex-col gap-4"
					onsubmit={(event) => {
						event.preventDefault();
						continueFromWorkspace();
					}}
				>
					<label class="flex flex-col gap-1.5 text-sm font-medium" for="onboarding-workspace-name">
						Workspace name
						<Input
							id="onboarding-workspace-name"
							data-workspace-name
							bind:value={workspaceName}
							placeholder="local"
							autocomplete="off"
						/>
					</label>
					<p data-workspace-hint class="text-sm text-muted-foreground">
						Use anything. You can rename later. <Kbd>local</Kbd> works fine.
					</p>
					<div class="flex justify-end">
						<Button type="submit" data-workspace-continue>Continue</Button>
					</div>
				</form>
			</Card>
		</section>
	{:else if phase === "project"}
		<!--
			DESIGN §11 step 2: "What are you building?". COPY §7 verbatim:
			"One sentence. Become the project description." / [ Create project ].
		-->
		<section
			class="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-6 py-12"
		>
			<div class="space-y-1">
				<p
					data-onboarding-eyebrow
					class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
				>
					first run · 2 of 2 · workspace {workspaceLabel}
				</p>
				<h1 data-onboarding-heading class="text-2xl font-semibold tracking-tight">
					What are you building?
				</h1>
			</div>
			<Card class="flex flex-col gap-4 p-5">
				<form
					class="flex flex-col gap-4"
					onsubmit={(event) => {
						event.preventDefault();
						createProject();
					}}
				>
					<label class="flex flex-col gap-1.5 text-sm font-medium" for="onboarding-project-prompt">
						Project
						<Input
							id="onboarding-project-prompt"
							data-project-prompt
							bind:value={projectPrompt}
							placeholder="A first-run onboarding flow that teaches itself."
							autocomplete="off"
						/>
					</label>
					<p data-project-hint class="text-sm text-muted-foreground">
						One sentence. Become the project description.
					</p>
					<div class="flex justify-between">
						<Button variant="ghost" data-onboarding-back onclick={() => (phase = "workspace")}>
							Back
						</Button>
						<Button type="submit" data-project-create>Create project</Button>
					</div>
				</form>
			</Card>
		</section>
	{:else}
		<!--
			DESIGN §11 steps 3–5: the OD `onboarding.html` Capture surface. The
			`.doc` reproduces the OD body verbatim; the `.scrim` dims everything
			except the `.anchor`; the coachmark teaches the first ▶ Play.
		-->
		{#if coachmarkOpen}
			<!--
				The scrim: OD `onboarding.html` `.scrim`. Dims the Capture doc so
				the lit `.anchor` block is the only thing the eye lands on. It is
				`pointer-events-none` so the lit anchor stays interactive.
			-->
			<div
				data-onboarding-scrim
				class="pointer-events-none fixed inset-0 z-40 bg-foreground/55"
			></div>
		{/if}

		<article
			data-capture-surface
			class="relative z-[1] mx-auto w-full max-w-[760px] px-6 pb-32 pt-12"
		>
			<p
				data-onboarding-eyebrow
				class="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
			>
				capture · seedlings
			</p>
			<h1 class="text-[28px] font-semibold tracking-tight">
				What's your workspace called?
			</h1>
			<p data-onboarding-meta class="mb-6 mt-1.5 font-mono text-[11px] text-muted-foreground">
				Use anything. You can rename later. local works fine.
			</p>

			<h2 class="mt-6 text-xl font-semibold">What are you building?</h2>
			<p class="mt-3 text-sm leading-relaxed text-foreground">
				One sentence. Become the project description.
			</p>

			<h2 class="mt-6 text-xl font-semibold">Type or paste anything. Press ⌘/ to ask an agent.</h2>
			<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
				No tour. No multi-step wizard. The interface is the tutorial.
			</p>

			<!--
				The lit `.anchor` block: OD `onboarding.html` `.anchor`. It carries
				the universal four-mode `ModeRow` (DESIGN §4.13). `z-50` lifts it
				above the scrim; the accent ring + glow reproduce the OD treatment.
			-->
			<div
				data-coach-anchor
				class={[
					"relative z-50 my-3 flex flex-wrap items-center gap-3 rounded-md border bg-card p-4 leading-relaxed",
					coachmarkOpen
						? "border-primary shadow-[0_0_0_8px_var(--color-ring)] ring-1 ring-primary"
						: "border-border",
				]}
			>
				<span class="min-w-0 flex-1 text-sm leading-relaxed">
					Type or paste anything. Press ⌘/ to ask an agent.
				</span>
				<ModeRow
					class="ml-auto flex-wrap"
					bind:value={anchorMode}
					ariaLabel="Step modes"
					onSelect={(mode) => {
						if (mode === "play") tryFirstPlay();
					}}
				/>
			</div>

			{#if coachmarkOpen}
				<!--
					The first-▶-Play coachmark: OD `onboarding.html` `.coach-fixed`.
					A positioned `Card` (an existing ui-kit primitive: no hand-rolled
					overlay): uppercase step eyebrow, the Play teaching copy, a 5-dot
					progress indicator (dot 3 active), a ghost "Skip tour" and a primary
					"Got it: try Play" action. `role="dialog"` + `aria-label` make it a
					discrete keyboard target; Esc dismisses it.
				-->
				<Card
					data-onboarding-coachmark
					role="dialog"
					aria-label="First-run coachmark · step 3 of 5"
					class="relative z-[60] my-3 w-full max-w-[340px] border-primary bg-primary p-4 text-primary-foreground shadow-lg sm:ml-8"
				>
					<p
						data-coachmark-step
						class="text-[11px] font-medium uppercase tracking-[0.06em] opacity-85"
					>
						Tip · step 3 of 5
					</p>
					<p data-coachmark-body class="mt-1 text-sm leading-relaxed">
						<strong>▶ Play</strong> hands this step to an agent. The plan keeps streaming while it
						runs, and pauses for your approval before any file write. You can stop it at any time
						with <Kbd>Esc</Kbd>.
					</p>
					<div class="mt-3 flex items-center gap-2">
						<span data-coachmark-dots class="inline-flex gap-1" aria-hidden="true">
							{#each [1, 2, 3, 4, 5] as dot (dot)}
								<span
									data-coachmark-dot
									data-active={dot === 3 ? "true" : undefined}
									class={[
										"size-1.5 rounded-full",
										dot === 3 ? "bg-primary-foreground" : "bg-primary-foreground/40",
									]}
								></span>
							{/each}
						</span>
						<span class="flex-1"></span>
						<Button
							data-coachmark-skip
							size="sm"
							variant="ghost"
							class="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
							onclick={dismissCoachmark}
						>
							Skip tour
						</Button>
						<Button
							data-coachmark-confirm
							size="sm"
							class="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
							onclick={tryFirstPlay}
						>
							Got it: try Play
						</Button>
					</div>
				</Card>
			{/if}

			<p class="mt-3 text-sm leading-relaxed text-foreground">
				After you try it, you'll land in the <strong>Plan</strong> stage with a live AI session
				running. Every step there has the same Play / Discuss row.
			</p>

			<h2 class="mt-6 text-xl font-semibold">What stays the same everywhere</h2>
			<ol class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground">
				<li>
					The status footer at the bottom mirrors the TUI exactly: same vocabulary across web,
					CLI, mobile.
				</li>
				<li>Trace IDs appear on every surface. Click any pill to copy.</li>
				<li>
					<Kbd>⌘K</Kbd> opens the command palette; <Kbd>⌘/</Kbd> toggles AI Assist;
					<Kbd>?</Kbd> opens the keyboard map.
				</li>
			</ol>

			<!--
				DESIGN §11 step 5: the first trace ID surface pulses once. The
				`TraceChip` primitive carries the trace; `data-trace-pulsed` flips
				once on first render and drives the one-shot pulse animation.
			-->
			<div class="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
				<span>First trace</span>
				<span
					data-onboarding-trace
					data-trace-pulsed={tracePulsed ? "true" : undefined}
					class={["inline-flex rounded-sm", tracePulsed && "onboarding-trace-pulse"]}
				>
					<TraceChip traceId={FIRST_RUN_TRACE} short />
				</span>
			</div>
		</article>
	{/if}
</main>

<style>
	/*
	 * DESIGN §11 step 5: the first trace ID surface pulses exactly once. A
	 * one-shot keyframe (no `infinite`); `prefers-reduced-motion: reduce`
	 * suppresses it entirely (DESIGN.md §1.6 reduced-motion guarantee).
	 */
	.onboarding-trace-pulse {
		animation: onboarding-trace-pulse 900ms ease-out 1;
	}

	@keyframes onboarding-trace-pulse {
		0% {
			box-shadow: 0 0 0 0 var(--color-ring);
		}
		100% {
			box-shadow: 0 0 0 10px transparent;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.onboarding-trace-pulse {
			animation: none;
		}
	}
</style>
