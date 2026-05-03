<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		flag: string;
		flags?: Record<string, boolean>;
		fallback?: boolean | Snippet;
		children?: Snippet;
	}

	let { flag, flags = {}, fallback = true, children }: Props = $props();
	const enabled = $derived(flags[flag] === true);
</script>

{#if enabled}
	{@render children?.()}
{:else if typeof fallback === "function"}
	{@render fallback()}
{:else if fallback}
	<div data-feature-gate-fallback role="note" class="rounded-md border border-border p-4 text-sm">
		Enable this feature in Settings → Feature Flags.
	</div>
{/if}

