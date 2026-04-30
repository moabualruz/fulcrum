<script lang="ts">
	import type { PageData } from "./$types";
	import ProjectForm from "$lib/components/projects/ProjectForm.svelte";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<header
	data-projects-new-header
	class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
	<div class={cn("flex items-center gap-3")}>
		<a
			href="/projects"
			data-back-projects
			class={cn("text-sm text-muted-foreground hover:underline")}
		>← Projects</a>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>New project</h1>
	</div>
</header>

<ProjectForm form={data.form} />
