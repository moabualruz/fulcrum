<script lang="ts">
	import { untrack } from "svelte";
	import { enhance } from "$app/forms";
	import type { ActionData, PageData } from "./$types";
	import MarkdownEditor from "$lib/components/markdown/MarkdownEditor.svelte";
	import { buttonVariants } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	const KINDS = ["decision", "spec", "note", "runbook"] as const;

	// Local mirrors seeded once — keystrokes don't recompute against re-rendered
	// `data.form.data` on every input event.
	let titleValue = $state(untrack(() => data.form.data.title ?? ""));
	let kindValue = $state(untrack(() => data.form.data.kind ?? "note"));
	let labelsValue = $state(untrack(() => data.form.data.labels ?? ""));
	let bodyValue = $state(untrack(() => data.form.data.body ?? ""));

	const errors = $derived(form?.form?.errors ?? data.form.errors ?? {});
	const titleError = $derived<string | undefined>(errors.title?.[0]);
	const kindError = $derived<string | undefined>(errors.kind?.[0]);
	const bodyError = $derived<string | undefined>(errors.body?.[0]);
</script>

<header
	data-docs-new-header
	class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
	<div class={cn("flex items-center gap-3")}>
		<a href="/docs" data-back-docs class={cn("text-sm text-muted-foreground hover:underline")}>← Documents</a>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>New document</h1>
	</div>
</header>

<form
	method="POST"
	data-doc-new-form
	use:enhance
	class={cn("flex flex-col gap-4 max-w-3xl")}
>
	<div class={cn("flex flex-col gap-1.5")}>
		<label for="doc-title" class={cn("text-sm font-medium")}>Title</label>
		<input
			id="doc-title"
			name="title"
			type="text"
			data-doc-title
			bind:value={titleValue}
			aria-invalid={titleError ? "true" : undefined}
			required
			maxlength="120"
			class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
		/>
		{#if titleError}
			<p data-error-title class={cn("text-destructive text-xs")}>{titleError}</p>
		{/if}
	</div>

	<div class={cn("flex flex-col gap-1.5")}>
		<label for="doc-kind" class={cn("text-sm font-medium")}>Kind</label>
		<select
			id="doc-kind"
			name="kind"
			data-doc-kind
			bind:value={kindValue}
			aria-invalid={kindError ? "true" : undefined}
			class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
		>
			{#each KINDS as kind (kind)}
				<option value={kind}>{kind}</option>
			{/each}
		</select>
		{#if kindError}
			<p data-error-kind class={cn("text-destructive text-xs")}>{kindError}</p>
		{/if}
	</div>

	<div class={cn("flex flex-col gap-1.5")}>
		<label for="doc-labels" class={cn("text-sm font-medium")}>Labels</label>
		<input
			id="doc-labels"
			name="labels"
			type="text"
			data-doc-labels
			bind:value={labelsValue}
			placeholder="comma, separated"
			class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
		/>
	</div>

	<div class={cn("flex flex-col gap-1.5")}>
		<label for="doc-body" class={cn("text-sm font-medium")}>Body</label>
		<MarkdownEditor bind:value={bodyValue} ariaLabel="Document body" />
		<input type="hidden" name="body" value={bodyValue} />
		{#if bodyError}
			<p data-error-body class={cn("text-destructive text-xs")}>{bodyError}</p>
		{/if}
	</div>

	<div class={cn("flex items-center gap-2 pt-2")}>
		<button
			type="submit"
			data-doc-submit
			class={cn(buttonVariants({ variant: "default" }))}
		>Create document</button>
	</div>
</form>
