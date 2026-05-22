<script lang="ts">
	import { page } from "$app/state";
	import { buttonVariants } from "@fulcrum/ui-kit";
	import { cn } from "@fulcrum/ui-kit";

	const error = $derived(page.error);
	const status = $derived(page.status);
</script>

<main class={cn("mx-auto flex w-full max-w-2xl flex-col gap-4 p-6")}>
	<section
		data-doc-planning-error
		role="alert"
		class={cn("rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm")}
	>
		<p class={cn("text-xs text-muted-foreground")}>{status}</p>
		<h1 class={cn("text-lg font-semibold text-destructive")}>Document could not load for planning</h1>
		<p class={cn("mt-1 text-muted-foreground")}>{error?.message ?? "Document not found"}</p>
		<p class={cn("mt-2 text-muted-foreground")}>Recovery: return to Documents, refresh the list, then reopen the document and try planning again.</p>
		<p class={cn("mt-1 font-mono text-xs text-muted-foreground")}>trace: docs-planning</p>
		<a
			href="/docs"
			data-doc-planning-error-back
			class={cn(buttonVariants({ variant: "outline" }), "mt-3 inline-flex")}
		>Back to documents</a>
	</section>
</main>
