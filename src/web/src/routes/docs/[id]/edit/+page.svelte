<script lang="ts">
	import { untrack } from "svelte";
	import { enhance } from "$app/forms";
	import type { ActionData, PageData } from "./$types";
	import type { JSONContent } from "@tiptap/core";
	import CommentsPanel from "$lib/components/editor/CommentsPanel.svelte";
	import DocEditor from "$lib/components/editor/DocEditor.svelte";
	import FrontmatterForm from "$lib/components/docs/FrontmatterForm.svelte";
	import FrontmatterYaml from "$lib/components/docs/FrontmatterYaml.svelte";
	import { buttonVariants } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";
	import type { DocType } from "../../../../../../db/entities/docs/enums.ts";
	import type { FrontmatterValue } from "$lib/components/docs/frontmatter-ui.ts";

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	const KINDS = ["decision", "spec", "note", "runbook"] as const;

	let titleValue = $state(untrack(() => data.form.data.title ?? ""));
	let kindValue = $state(untrack(() => data.form.data.kind ?? "note"));
	let labelsValue = $state(untrack(() => data.form.data.labels ?? ""));
	let bodyValue = $state(untrack(() => data.form.data.body ?? ""));
	let frontmatterValue = $state<FrontmatterValue>(untrack(() => data.doc.frontmatter ?? {}));
	let frontmatterMode = $state<"form" | "yaml">("form");
	/* svelte-ignore state_referenced_locally */
	let contentJson = $state<JSONContent>(untrack(() => data.doc.contentJson ?? markdownToDoc(bodyValue)));

	const errors = $derived(form?.form?.errors ?? data.form.errors ?? {});
	const titleError = $derived<string | undefined>(errors.title?.[0]);
	const kindError = $derived<string | undefined>(errors.kind?.[0]);
	const bodyError = $derived<string | undefined>(errors.body?.[0]);
	const frontmatterErrors = $derived<Record<string, string[]>>(errors.frontmatter ?? {});
	const frontmatterMissing = $derived<string[]>(form?.missingFrontmatter ?? []);
	const frontmatterToast = $derived(
		frontmatterMissing.length ? `Missing required fields: ${frontmatterMissing.join(", ")}` : undefined,
	);
	const docType = $derived((data.doc.kind ?? "note") as DocType);

	function handleDocChange(event: CustomEvent<{ contentJson: JSONContent; bodyMd: string }>): void {
		contentJson = event.detail.contentJson;
		bodyValue = event.detail.bodyMd;
	}

	function handleFrontmatterChange(event: CustomEvent<FrontmatterValue>): void {
		frontmatterValue = event.detail;
	}

	function markdownToDoc(body: string): JSONContent {
		const paragraphs = body.split(/\n{2,}/).map((text) => ({
			type: "paragraph",
			content: text ? [{ type: "text", text }] : undefined,
		}));

		return {
			type: "doc",
			content: paragraphs.length ? paragraphs : [{ type: "paragraph" }],
		};
	}
</script>

<header
	data-doc-edit-header
	class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}
>
	<div class={cn("flex items-baseline gap-3")}>
		<a
			href="/docs/{data.doc.id}"
			data-back-doc
			class={cn("text-sm text-muted-foreground hover:underline")}
		>← {data.doc.title}</a>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>Edit document</h1>
	</div>
</header>

<div data-doc-edit-with-comments class={cn("grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]")}>
	<form
		method="POST"
		data-doc-edit-form
		use:enhance
		class={cn("flex max-w-3xl flex-col gap-4")}
	>
		<aside
			data-frontmatter-panel
			class={cn("border-border bg-muted/30 flex flex-col gap-3 rounded-md border p-3")}
		>
			<div class={cn("flex items-center justify-between gap-3")}>
				<h2 class={cn("text-sm font-semibold")}>Frontmatter</h2>
				<button
					type="button"
					data-frontmatter-toggle-yaml
					class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
					onclick={() => frontmatterMode = frontmatterMode === "form" ? "yaml" : "form"}
				>{frontmatterMode === "form" ? "YAML" : "Form"}</button>
			</div>
			{#if frontmatterToast}
				<p data-frontmatter-toast class={cn("text-destructive text-xs")}>{frontmatterToast}</p>
			{/if}
			{#if frontmatterMode === "form"}
				<FrontmatterForm
					docType={docType}
					value={frontmatterValue}
					errors={frontmatterErrors}
					onchange={handleFrontmatterChange}
				/>
			{:else}
				<FrontmatterYaml docType={docType} value={frontmatterValue} onchange={handleFrontmatterChange} />
			{/if}
		</aside>

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
		<DocEditor content={contentJson} onchange={handleDocChange} ariaLabel="Document body" />
		<p data-autosave-indicator class={cn("text-xs text-muted-foreground")}>Autosave ready</p>
		{#if bodyError}
			<p data-error-body class={cn("text-destructive text-xs")}>{bodyError}</p>
		{/if}
	</div>

		<div class={cn("flex items-center gap-2 pt-2")}>
			<button
				type="submit"
				data-doc-save
				class={cn(buttonVariants({ variant: "default" }))}
			>Save</button>
			<a
				href="/docs/{data.doc.id}"
				data-doc-cancel
				class={cn(buttonVariants({ variant: "outline" }))}
			>Cancel</a>
		</div>
	</form>

	<div data-comments-sidebar>
		<CommentsPanel threads={[]} resolvedThreads={[]} />
	</div>
</div>
