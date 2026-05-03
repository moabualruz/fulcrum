<script lang="ts">
	import { untrack } from "svelte";
	import { enhance } from "$app/forms";
	import type { ActionData, PageData } from "./$types";
	import MarkdownEditor from "$lib/components/markdown/MarkdownEditor.svelte";
	import { buttonVariants } from "$lib/components/ui/button";
	import {
		applyTemplateSelectionChange,
		buildDocTypeOptions,
		createInitialTemplateState,
		markTemplateBodyEdited,
		type TemplatePickerState,
	} from "$lib/docs/template-picker";
	import { DOC_TYPE_DESCRIPTIONS, DOC_TYPE_LABELS } from "$lib/docs/doc-templates";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	const templates = untrack(() => data.templates ?? {});
	const KINDS = buildDocTypeOptions(templates);
	const initialTemplateState = untrack(() => createInitialTemplateState({
		formKind: data.form.data.kind,
		formBody: data.form.data.body,
		templates,
	}));

	// Local mirrors seeded once — keystrokes don't recompute against re-rendered
	// `data.form.data` on every input event.
	let titleValue = $state(untrack(() => data.form.data.title ?? ""));
	let kindValue = $state(initialTemplateState.kind);
	let labelsValue = $state(untrack(() => data.form.data.labels ?? ""));
	let bodyValue = $state(initialTemplateState.body);
	let lastAppliedTemplate = $state(initialTemplateState.lastTemplate);
	let bodyEdited = $state(initialTemplateState.bodyEdited);
	let wizardStep = $state<"type" | "template" | "details">("type");

	const errors = $derived(form?.form?.errors ?? data.form.errors ?? {});
	const titleError = $derived<string | undefined>(errors.title?.[0]);
	const kindError = $derived<string | undefined>(errors.kind?.[0]);
	const bodyError = $derived<string | undefined>(errors.body?.[0]);

	function currentTemplateState(): TemplatePickerState {
		return {
			kind: kindValue,
			body: bodyValue,
			lastTemplate: lastAppliedTemplate,
			bodyEdited,
		};
	}

	function applyTemplateState(next: TemplatePickerState): void {
		kindValue = next.kind;
		bodyValue = next.body;
		lastAppliedTemplate = next.lastTemplate;
		bodyEdited = next.bodyEdited;
	}

	function handleKindChange(event: Event): void {
		const nextKind = (event.currentTarget as HTMLSelectElement).value;
		applyTemplateState(
			applyTemplateSelectionChange(currentTemplateState(), nextKind, templates),
		);
	}

	function chooseDocType(kind: string): void {
		applyTemplateState(
			applyTemplateSelectionChange(currentTemplateState(), kind, templates),
		);
		wizardStep = "template";
	}

	function useSelectedTemplate(): void {
		wizardStep = "details";
	}

	function handleBodyChange(nextBody: string): void {
		applyTemplateState(markTemplateBodyEdited(currentTemplateState(), nextBody));
	}
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

<section data-doc-new-wizard class={cn("mb-4 flex max-w-5xl flex-col gap-4")}>
	{#if wizardStep === "type"}
		<div class={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3")}>
			{#each KINDS as kind (kind)}
				<button
					type="button"
					data-doc-type-card
					class={cn(
						"border-border bg-background hover:bg-muted/50 flex min-h-28 flex-col items-start gap-2 rounded-md border p-4 text-left",
					)}
					onclick={() => chooseDocType(kind)}
				>
					<span class={cn("text-sm font-semibold")}>{DOC_TYPE_LABELS[kind] ?? kind}</span>
					<span class={cn("text-muted-foreground text-sm")}>{DOC_TYPE_DESCRIPTIONS[kind] ?? "Document template."}</span>
				</button>
			{/each}
		</div>
	{:else if wizardStep === "template"}
		<div data-template-picker class={cn("border-border flex flex-col gap-3 rounded-md border p-4")}>
			<div class={cn("flex items-center justify-between gap-3")}>
				<div>
					<h2 class={cn("text-sm font-semibold")}>Default {kindValue}</h2>
					<p class={cn("text-muted-foreground text-xs")}>Template selected for {DOC_TYPE_LABELS[kindValue] ?? kindValue}</p>
				</div>
				<button
					type="button"
					class={cn(buttonVariants({ variant: "default", size: "sm" }))}
					onclick={useSelectedTemplate}
				>Use template</button>
			</div>
			<pre class={cn("bg-muted max-h-56 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap")}>{bodyValue}</pre>
		</div>
	{/if}
</section>

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
			onchange={handleKindChange}
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
		<MarkdownEditor bind:value={bodyValue} onChange={handleBodyChange} ariaLabel="Document body" />
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
