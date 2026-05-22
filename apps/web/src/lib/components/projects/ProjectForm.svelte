<script lang="ts">
	import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@fulcrum/ui-kit";
	import { untrack } from "svelte";
	import { enhance } from "$app/forms";
	import type { SuperValidated } from "sveltekit-superforms";
	import type { ProjectFormValues } from "$lib/server/projects.schema";
	import { deriveAutoSlug } from "./auto-slug";

	interface Props {
		form: SuperValidated<ProjectFormValues>;
		parentProjects?: Array<{ id: string; name: string }>;
	}

	let { form, parentProjects = [] }: Props = $props();

	// Local reactive copies seeded from the server-validated form. Plain Svelte
	// runes are sufficient here: the heavy `superForm` client wiring is not
	// needed for this single-action POST flow, and avoiding it keeps SSR clean
	// (no `$app/stores`, `$app/navigation`, `$app/environment` imports leaking
	// into server-render harnesses). `untrack` so the initial seed does not
	// re-run when an unrelated prop changes.
	let nameValue = $state(untrack(() => form.data.name ?? ""));
	let slugValue = $state(untrack(() => form.data.slug ?? ""));
	let descriptionValue = $state(untrack(() => form.data.description ?? ""));
	let kindValue = $state(untrack(() => form.data.kind ?? "project"));
	let repoPathValue = $state(untrack(() => form.data.repoPath ?? ""));
	let templateValue = $state(untrack(() => form.data.template ?? "agent-os-software-project"));
	let parentIdValue = $state(untrack(() => form.data.parentId ?? ""));
	let slugTouched = $state(false);

	const nameError = $derived<string | undefined>(form.errors?.name?.[0]);
	const slugError = $derived<string | undefined>(form.errors?.slug?.[0]);
	const descriptionError = $derived<string | undefined>(form.errors?.description?.[0]);
	const kindError = $derived<string | undefined>(form.errors?.kind?.[0]);
	const repoPathError = $derived<string | undefined>(form.errors?.repoPath?.[0]);
	const templateError = $derived<string | undefined>(form.errors?.template?.[0]);
	const parentIdError = $derived<string | undefined>(form.errors?.parentId?.[0]);
	const parentProjectLabel = $derived(
		parentProjects.find((project) => project.id === parentIdValue)?.name ?? "No parent",
	);

	function onNameInput(event: Event): void {
		const target = event.target as HTMLInputElement;
		nameValue = target.value;
		const next = deriveAutoSlug(nameValue, slugValue, slugTouched);
		if (next !== slugValue) slugValue = next;
	}

	function onSlugInput(event: Event): void {
		const target = event.target as HTMLInputElement;
		slugValue = target.value;
		// Empty after a manual edit means "go back to auto"; otherwise stay manual.
		slugTouched = slugValue.length > 0;
	}

	$effect(() => {
		if (!slugTouched) slugValue = deriveAutoSlug(nameValue, slugValue, false);
	});
</script>

<form
	method="POST"
	action="?/create"
	data-project-form
	use:enhance
	class="flex flex-col gap-4 max-w-xl"
>
	<div class="flex flex-col gap-1.5">
		<label for="project-name" class="text-sm font-medium">Name</label>
		<input
			id="project-name"
			name="name"
			type="text"
			data-project-name
			data-slot="input"
			bind:value={nameValue}
			oninput={onNameInput}
			aria-invalid={nameError ? "true" : undefined}
			required
			maxlength="80"
			class="border-input bg-background h-9 rounded-md border px-3 py-1 text-sm shadow-xs"
		/>
		{#if nameError}
			<p data-error-name class="text-destructive text-xs">{nameError}</p>
		{/if}
	</div>

	<div class="flex flex-col gap-1.5">
		<label for="project-slug" class="text-sm font-medium">Slug</label>
		<input
			id="project-slug"
			name="slug"
			type="text"
			data-project-slug
			data-slot="input"
			bind:value={slugValue}
			oninput={onSlugInput}
			aria-invalid={slugError ? "true" : undefined}
			pattern={"[a-z0-9][a-z0-9-]{0,63}"}
			required
			class="border-input bg-background h-9 rounded-md border px-3 py-1 text-sm font-mono shadow-xs"
		/>
		{#if slugError}
			<p data-error-slug class="text-destructive text-xs">{slugError}</p>
		{/if}
	</div>

	<div class="flex flex-col gap-1.5">
		<label for="project-description" class="text-sm font-medium">Description</label>
		<textarea
			id="project-description"
			name="description"
			data-project-description
			data-slot="textarea"
			bind:value={descriptionValue}
			oninput={(e) => (descriptionValue = (e.target as HTMLTextAreaElement).value)}
			rows="3"
			maxlength="280"
			class="border-input bg-background min-h-16 rounded-md border px-3 py-2 text-sm shadow-xs"
		></textarea>
		{#if descriptionError}
			<p data-error-description class="text-destructive text-xs">{descriptionError}</p>
		{/if}
	</div>

	<div class="flex flex-col gap-1.5">
		<label id="project-kind-label" class="text-sm font-medium">Kind</label>
		<input type="hidden" name="kind" value={kindValue} data-project-kind />
		<Select
			name="kind"
			bind:value={kindValue}
			type="single"
			data-project-kind-select
			aria-invalid={kindError ? "true" : undefined}
		>
			<SelectTrigger
				aria-labelledby="project-kind-label"
				aria-invalid={kindError ? "true" : undefined}
			>
				<SelectValue placeholder="Project" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="workspace" label="Workspace" />
				<SelectItem value="project" label="Project" />
				<SelectItem value="subproject" label="Subproject" />
			</SelectContent>
		</Select>
		{#if kindError}
			<p data-error-kind class="text-destructive text-xs">{kindError}</p>
		{/if}
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		<div class="flex flex-col gap-1.5">
			<label for="project-repo-path" class="text-sm font-medium">Repository path</label>
			<input
				id="project-repo-path"
				name="repoPath"
				type="text"
				data-project-repo-path
				data-slot="input"
				bind:value={repoPathValue}
				aria-invalid={repoPathError ? "true" : undefined}
				placeholder="/Users/me/workspace/repo"
				maxlength="500"
				class="border-input bg-background h-9 rounded-md border px-3 py-1 text-sm font-mono shadow-xs"
			/>
			{#if repoPathError}
				<p data-error-repo-path class="text-destructive text-xs">{repoPathError}</p>
			{/if}
		</div>

		<div class="flex flex-col gap-1.5">
			<label id="project-template-label" class="text-sm font-medium">Template</label>
			<input type="hidden" name="template" value={templateValue} data-project-template />
			<Select
				name="template"
				bind:value={templateValue}
				type="single"
				data-project-template-select
				aria-invalid={templateError ? "true" : undefined}
			>
				<SelectTrigger
					aria-labelledby="project-template-label"
					aria-invalid={templateError ? "true" : undefined}
				>
					<SelectValue placeholder="Agent OS Software Project" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem
						value="agent-os-software-project"
						label="Agent OS Software Project"
					/>
				</SelectContent>
			</Select>
			{#if templateError}
				<p data-error-template class="text-destructive text-xs">{templateError}</p>
			{/if}
		</div>
	</div>

	<div class="flex flex-col gap-1.5">
		<label id="project-parent-id-label" class="text-sm font-medium">Parent project</label>
		<input type="hidden" name="parentId" value={parentIdValue} data-project-parent />
		<Select
			name="parentId"
			bind:value={parentIdValue}
			type="single"
			data-project-parent-select
			aria-invalid={parentIdError ? "true" : undefined}
		>
			<SelectTrigger
				aria-labelledby="project-parent-id-label"
				aria-invalid={parentIdError ? "true" : undefined}
			>
				<SelectValue placeholder={parentProjectLabel} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="" label="No parent" />
				{#each parentProjects as project (project.id)}
					<SelectItem value={project.id} label={project.name} />
				{/each}
			</SelectContent>
		</Select>
		{#if parentIdError}
			<p data-error-parent-id class="text-destructive text-xs">{parentIdError}</p>
		{/if}
	</div>

	<div class="flex items-center gap-2 pt-2">
		<button
			type="submit"
			data-project-submit
			data-slot="button"
			class="bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium shadow-xs"
		>Create project</button>
	</div>
</form>
