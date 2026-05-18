<script lang="ts">
	import { page } from "$app/state";
	import { buttonVariants } from "@fulcrum/ui-kit";
	import { cn } from "$lib/utils.js";

	const error = $derived(page.error);
	const status = $derived(page.status);
</script>

<main class={cn("mx-auto flex w-full max-w-2xl flex-col gap-4 p-6")}>
	<section
		data-doc-edit-error
		role="alert"
		class={cn("rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm")}
	>
		<p class={cn("text-xs text-muted-foreground")}>{status}</p>
		<h1 class={cn("text-lg font-semibold text-destructive")}>Document could not load for editing</h1>
		<p class={cn("mt-1 text-muted-foreground")}>{error?.message ?? "Document not found"}</p>
		<p class={cn("mt-2 text-muted-foreground")}>Recovery: return to Documents, refresh the list, then reopen the document and try editing again.</p>
		<p class={cn("mt-1 font-mono text-xs text-muted-foreground")}>trace: docs-edit</p>
		<div class={cn("mt-3 flex items-center gap-2")}>
			<a
				href="/docs"
				data-doc-edit-error-back
				class={cn(buttonVariants({ variant: "outline" }))}
			>Back to documents</a>
		</div>
	</section>
</main>
