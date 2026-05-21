<script lang="ts">
	import type { PageData } from "./$types";
	import StageRoutePage from "../+page.svelte";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<StageRoutePage
	data={{
		ws: data.ws,
		projId: data.projId,
		stage: data.stage,
		defaultSub: data.sub || data.defaultSub,
		captureView: null,
		captureSteps: [],
		traceId: data.traceId,
	}}
/>
