<script lang="ts">
	import DocTemplatesManager from "$lib/components/docs/DocTemplatesManager.svelte";
	import type { PageData } from "./$types";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<DocTemplatesManager templates={data.templates} projectId={data.projectId} />
