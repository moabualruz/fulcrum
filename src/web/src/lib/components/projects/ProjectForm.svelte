<script lang="ts">
	import { untrack } from "svelte";
	import { enhance } from "$app/forms";
	import type { SuperValidated } from "sveltekit-superforms";
	import type { ProjectFormValues } from "$lib/server/projects.schema";
	import { deriveAutoSlug } from "./auto-slug";

	interface Props {
		form: SuperValidated<ProjectFormValues>;
	}

	let { form }: Props = $props();

	// Local reactive copies seeded from the server-validated form. Plain Svelte
	// runes are sufficient here — the heavy `superForm` client wiring is not
	// needed for this single-action POST flow, and avoiding it keeps SSR clean
	// (no `$app/stores`, `$app/navigation`, `$app/environment` imports leaking
	// into server-render harnesses). `untrack` so the initial seed does not
	// re-run when an unrelated prop changes.
	let nameValue = $state(untrack(() => form.data.name ?? ""));
	let slugValue = $state(untrack(() => form.data.slug ?? ""));
	let descriptionValue = $state(untrack(() => form.data.description ?? ""));
	let slugTouched = $state(false);

	const nameError = $derived<string | undefined>(form.errors?.name?.[0]);
	const slugError = $derived<string | undefined>(form.errors?.slug?.[0]);
	const descriptionError = $derived<string | undefined>(form.errors?.description?.[0]);

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
</script>

<form
	method="POST"
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
			value={nameValue}
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
			value={slugValue}
			oninput={onSlugInput}
			aria-invalid={slugError ? "true" : undefined}
			pattern="[a-z0-9][a-z0-9-]{'{0,63}'}"
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
			value={descriptionValue}
			oninput={(e) => (descriptionValue = (e.target as HTMLTextAreaElement).value)}
			rows="3"
			maxlength="280"
			class="border-input bg-background min-h-16 rounded-md border px-3 py-2 text-sm shadow-xs"
		></textarea>
		{#if descriptionError}
			<p data-error-description class="text-destructive text-xs">{descriptionError}</p>
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
