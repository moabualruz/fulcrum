<script lang="ts">
	/**
	 * `/planning/sessions` — legacy protocol-sessions feature route.
	 *
	 * `prd-web-plan-session-od-fidelity` folded the guided/freeform session
	 * controls into the OD Live Session Pane at `/plan-session` (DESIGN.md §8;
	 * IA-MAP.md §2.2 "Live protocol session"). The `AcpSession` typing and the
	 * `guidedAcpStart` / `freeformStart` action surface in
	 * `planning/sessions/+page.server.ts` are preserved untouched; the Plan dock
	 * tab of the new pane summarizes every guided session.
	 *
	 * This old path keeps resolving (`200`, no 404 — migration-strategy.md
	 * value-preservation item 2) and forwards to the canonical workbench.
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
	<title>Planning Sessions</title>
	<meta http-equiv="refresh" content="0; url=/plan-session" />
</svelte:head>

<main
	class="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-10 sm:px-6"
	data-sessions-page
	data-route="planning-sessions-redirect"
>
	<h1 class="text-xl font-semibold tracking-normal text-foreground">Sessions moved</h1>
	<p class="text-sm leading-6 text-muted-foreground">
		Guided and freeform planning sessions are now part of the Plan live session workbench.
	</p>
	<Button href={CANONICAL_ROUTE} size="sm" class="w-max">Open Plan session</Button>
</main>
