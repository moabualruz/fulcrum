<script lang="ts">
	/**
	 * `/planning`: legacy Plan-stage feature-bucket route.
	 *
	 * `prd-web-plan-session-od-fidelity` consolidated the two parallel Plan
	 * live-session implementations: this service-wired forms route and the
	 * OD-faithful `plan-session/` shell. The single rendered Plan live-session
	 * target is now `/plan-session` (OD `plan-session.html`, DESIGN.md §8 Live
	 * Session Pane, IA-MAP.md §2.2 "Live protocol session").
	 *
	 * Per the migration-strategy.md value-preservation checklist this old path
	 * must keep resolving (no 404) and its features must stay findable. The
	 * route resolves `200` and immediately forwards to the canonical session
	 * workbench; the `planning/+page.server.ts` action surface (`preview`,
	 * `materialize`, `freeformStart`, `freeformPrompt`, `guidedAcpStart`,
	 * `guidedAcpSessionAction`, `continuousUpdate`, `generate`,
	 * `runArtifactExecution`, `workflowCycle`) is preserved untouched: every
	 * `ActionForm` mode is summarized under the Plan dock tab of the new pane.
	 */
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { Button } from "@fulcrum/ui-kit";

	const CANONICAL_ROUTE = "/plan-session";

	onMount(() => {
		void goto(CANONICAL_ROUTE, { replaceState: true });
	});
</script>

<svelte:head>
	<title>Planning</title>
	<meta http-equiv="refresh" content="0; url=/plan-session" />
</svelte:head>

<main
	class="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-10 sm:px-6"
	data-planning-page
	data-route="planning-redirect"
>
	<h1 class="text-xl font-semibold tracking-normal text-foreground">Planning moved</h1>
	<p class="text-sm leading-6 text-muted-foreground">
		The planning workspace is now the Plan live session workbench. Every planning mode is
		available there under the workspace dock.
	</p>
	<Button href={CANONICAL_ROUTE} size="sm" class="w-max">Open Plan session</Button>
</main>
