<script lang="ts">
	import { page } from "$app/state";
	import { LoadingState } from "@fulcrum/ui-kit";

	const loadingState = $derived(page.url.searchParams.get("state") === "loading");
</script>

<svelte:head>
	<title>Review queue | Fulcrum</title>
</svelte:head>

<section data-route="review-queue" data-stage="review" data-state={loadingState ? "loading" : "ready"}>
	<LoadingState
		title="Loading Review queue"
		description="Fetching review lanes, checks, reviewers, and trace links."
		shape="table"
		rows={4}
	/>
</section>
