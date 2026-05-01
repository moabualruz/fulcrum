<script lang="ts">
	import { goto } from "$app/navigation";
	import { buttonVariants } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";
	import { runSetActive } from "./set-active-handler.ts";

	interface Props {
		slug: string;
		active?: boolean;
	}

	let { slug, active = false }: Props = $props();

	let busy = $state(false);

	async function onclick(): Promise<void> {
		busy = true;
		try {
			await runSetActive(slug, {
				fetch: window.fetch.bind(window),
				onSuccess: () => {
					void goto(window.location.pathname, { invalidateAll: true });
				},
			});
		} finally {
			busy = false;
		}
	}
</script>

<button
	type="button"
	data-set-active-project
	data-slug={slug}
	aria-pressed={active ? "true" : "false"}
	disabled={busy}
	{onclick}
	class={cn(
		buttonVariants({ variant: active ? "default" : "outline", size: "sm" }),
	)}
>{active ? "Active project" : "Set active"}</button>
