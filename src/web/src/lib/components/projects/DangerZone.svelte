<script lang="ts">
	import { enhance } from "$app/forms";
	import { cn } from "$lib/utils.js";

	interface Props {
		projectId: string;
		projectName: string;
	}

	let { projectId, projectName }: Props = $props();

	// `bits-ui` AlertDialog needs runtime context the SSR test cannot drive,
	// so this emits a flat shadcn-shape markup with a controlled `showConfirm`
	// toggle. The structural contract (trigger button + hidden confirm panel +
	// form posting `?/delete`) is what the test asserts on; the real UI
	// behaviour layers on top of those data attributes.
	let showConfirm = $state(false);

	function openConfirm(): void {
		showConfirm = true;
	}

	function cancelConfirm(): void {
		showConfirm = false;
	}
</script>

<div
	data-danger-zone
	data-project-id={projectId}
	class={cn("rounded-lg border border-destructive/40 bg-destructive/5 p-4")}
>
	<h2 class={cn("text-sm font-semibold text-destructive")}>Danger zone</h2>
	<p class={cn("mt-1 text-xs text-muted-foreground")}>
		Deleting <strong>{projectName}</strong> removes the project row and clears its event history.
	</p>
	<button
		type="button"
		data-danger-trigger
		data-state={showConfirm ? "open" : "closed"}
		onclick={openConfirm}
		class={cn(
			"mt-3 inline-flex h-9 items-center rounded-md border border-destructive/60 bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20",
		)}
	>Delete project</button>

	<div
		data-danger-confirm
		hidden={!showConfirm}
		class={cn("mt-3 flex flex-col gap-2 rounded-md border border-destructive/40 bg-background p-3")}
	>
		<p class={cn("text-xs text-muted-foreground")}>This action cannot be undone.</p>
		<form
			method="POST"
			action="?/delete"
			use:enhance
			data-delete-form
			class={cn("flex items-center gap-2")}
		>
			<button
				type="button"
				data-delete-cancel
				onclick={cancelConfirm}
				class={cn(
					"inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent",
				)}
			>Cancel</button>
			<button
				type="submit"
				data-delete-submit
				class={cn(
					"inline-flex h-8 items-center rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90",
				)}
			>Delete forever</button>
		</form>
	</div>
</div>
