<script lang="ts">
	import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";

	import { goto } from "$app/navigation";

	import { buttonVariants } from "@fulcrum/ui-kit";
	import { cn } from "@fulcrum/ui-kit";

	import { selectProject } from "./project-picker-helpers.ts";

	interface Project {
		slug: string;
		name: string;
	}
	interface Props {
		activeProjectId: string | null;
		projects: Project[];
	}

	let { activeProjectId, projects }: Props = $props();

	let activeName = $derived(
		activeProjectId === null
			? null
			: (projects.find((p) => p.slug === activeProjectId)?.name ??
				activeProjectId),
	);

	async function handle(slug: string | null) {
		const res = await selectProject(slug, {
			fetch: window.fetch.bind(window),
			onSuccess: () => {
				void goto(window.location.pathname, { invalidateAll: true });
			},
		});
		return res;
	}
</script>

<div data-project-picker>
	<button
		type="button"
		data-slot="dropdown-menu-trigger"
		data-project-picker-trigger
		class={cn(buttonVariants({ variant: "ghost" }), "gap-2")}
	>
		<span>{activeName ?? "Select project"}</span>
		<ChevronsUpDown aria-hidden="true" />
	</button>
	<div data-slot="dropdown-menu-content" data-project-picker-menu>
		{#each projects as p (p.slug)}
			<button
				type="button"
				data-slot="dropdown-menu-item"
				data-project-picker-item
				data-slug={p.slug}
				onclick={() => handle(p.slug)}
				class={cn(
					"flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
				)}
			>
				{p.name}
			</button>
		{/each}
		{#if activeProjectId !== null}
			<div data-slot="dropdown-menu-separator" aria-hidden="true"></div>
			<button
				type="button"
				data-slot="dropdown-menu-item"
				data-project-picker-clear
				onclick={() => handle(null)}
				class={cn(
					"flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
				)}
			>
				Clear active project
			</button>
		{/if}
	</div>
</div>
