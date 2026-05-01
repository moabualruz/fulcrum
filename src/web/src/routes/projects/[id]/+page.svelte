<script lang="ts">
	import { untrack } from "svelte";
	import { enhance } from "$app/forms";
	import type { ActionData, PageData } from "./$types";
	import DangerZone from "$lib/components/projects/DangerZone.svelte";
	import SetActiveButton from "$lib/components/projects/SetActiveButton.svelte";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	// Local mirrors seeded from `data.form.data` (load-time superValidate) so
	// keystrokes don't blow away the SuperValidated envelope on the server side.
	// `untrack` so the seed runs once at component mount; later `data` rerenders
	// (which re-seed on navigation between projects) leave keystrokes intact.
	let nameValue = $state(untrack(() => data.form.data.name ?? ""));
	let descriptionValue = $state(untrack(() => data.form.data.description ?? ""));

	// `form` (`ActionData`) is undefined on the load path; on a failed POST,
	// SvelteKit forwards `fail(400, { form })` here.
	const errors = $derived(form?.form?.errors ?? data.form.errors ?? {});
	const nameError = $derived<string | undefined>(errors.name?.[0]);
	const descriptionError = $derived<string | undefined>(errors.description?.[0]);

	function formatUpdated(value: string): string {
		const isoDate = value.slice(0, 10);
		const isoTime = value.slice(11, 16);
		return isoTime ? `${isoDate} ${isoTime}` : isoDate;
	}
</script>

<header
	data-project-detail-header
	class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}
>
	<div class={cn("flex items-baseline gap-3")}>
		<a href="/projects" data-back-projects class={cn("text-sm text-muted-foreground hover:underline")}>← Projects</a>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>{data.project.name}</h1>
		<span data-project-slug-pill class={cn("rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground")}>{data.project.slug}</span>
		<SetActiveButton slug={data.project.slug} active={data.activeProjectId === data.project.slug} />
	</div>
	<span data-project-updated class={cn("text-xs text-muted-foreground")}>Updated {formatUpdated(data.project.updated_at)}</span>
</header>

<form
	method="POST"
	action="?/rename"
	use:enhance
	data-rename-form
	class={cn("flex flex-col gap-4 max-w-xl")}
>
	<div class={cn("flex flex-col gap-1.5")}>
		<label for="rename-name" class={cn("text-sm font-medium")}>Name</label>
		<input
			id="rename-name"
			name="name"
			type="text"
			data-rename-name
			bind:value={nameValue}
			aria-invalid={nameError ? "true" : undefined}
			required
			maxlength="80"
			class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
		/>
		{#if nameError}
			<p data-error-name class={cn("text-destructive text-xs")}>{nameError}</p>
		{/if}
	</div>

	<div class={cn("flex flex-col gap-1.5")}>
		<label for="rename-description" class={cn("text-sm font-medium")}>Description</label>
		<textarea
			id="rename-description"
			name="description"
			data-rename-description
			bind:value={descriptionValue}
			rows="3"
			maxlength="280"
			class={cn("border-input bg-background min-h-16 rounded-md border px-3 py-2 text-sm shadow-xs")}
		></textarea>
		{#if descriptionError}
			<p data-error-description class={cn("text-destructive text-xs")}>{descriptionError}</p>
		{/if}
	</div>

	<div class={cn("flex items-center gap-2 pt-2")}>
		<button
			type="submit"
			data-rename-submit
			class={cn("bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium shadow-xs")}
		>Save</button>
	</div>
</form>

<div class={cn("my-8 border-t border-border")}></div>

<DangerZone projectId={data.project.id} projectName={data.project.name} />
