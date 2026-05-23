<script lang="ts">
	import { page } from "$app/state";
	import { LoadingState } from "@fulcrum/ui-kit";

	const loadingState = $derived(page.url.searchParams.get("state") === "loading");
</script>

<svelte:head>
	<title>Operate | Fulcrum</title>
</svelte:head>

<section data-route="operate" data-stage="operate" data-state={loadingState ? "loading" : "ready"}>
	<LoadingState
		title="Loading Operate"
		description="Fetching subsystem health, alerts, audit rows, and MCP state."
		shape="table"
		rows={5}
	/>
</section>
