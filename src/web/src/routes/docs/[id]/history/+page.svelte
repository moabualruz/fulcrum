<script lang="ts">
	import { enhance } from "$app/forms";
	import type { PageData } from "./$types";
	import { buttonVariants } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<header data-doc-history-header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}>
	<div class={cn("flex items-baseline gap-3")}>
		<a href="/docs/{data.doc.id}" data-back-doc class={cn("text-sm text-muted-foreground hover:underline")}>← {data.doc.title}</a>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>History</h1>
	</div>
</header>

<div data-doc-history-view class={cn("grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]")}>
	<ol data-doc-history-timeline class={cn("space-y-2")}>
		{#each data.versions as version (version.id)}
			<li data-doc-version={version.versionNum} class={cn("rounded-md border border-border p-3")}>
				<div class={cn("flex items-center justify-between gap-2")}>
					<a href="?to={version.versionNum}" class={cn("font-medium hover:underline")}>Version {version.versionNum}</a>
					{#if version.isSnapshot}
						<span data-snapshot-badge class={cn("rounded bg-muted px-2 py-0.5 text-xs")}>snapshot</span>
					{/if}
				</div>
				<form method="POST" action="?/restore" use:enhance class={cn("mt-2")}>
					<input type="hidden" name="version_num" value={version.versionNum} />
					<button data-restore-version class={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Restore</button>
				</form>
			</li>
		{/each}
	</ol>
	<section data-doc-history-diff class={cn("rounded-md border border-border p-4")}>
		{@html data.diffHtml}
	</section>
</div>
