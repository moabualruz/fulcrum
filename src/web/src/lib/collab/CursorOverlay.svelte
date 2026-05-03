<script lang="ts">
	import type { CursorState } from "./types.js";

	interface Props {
		cursors: CursorState[];
	}

	let { cursors }: Props = $props();
</script>

{#if cursors.length > 0}
	<div data-cursor-overlay aria-hidden="true" class="pointer-events-none absolute inset-0">
		{#each cursors as cursor (cursor.userId)}
			<div
				data-cursor
				data-user-id={cursor.userId}
				data-anchor={cursor.anchor}
				data-head={cursor.head}
				class="absolute flex items-end gap-0.5"
				style="left: 0; top: 0;"
			>
				<div
					class="h-5 w-0.5"
					style="background-color: {cursor.user.color};"
				></div>
				<span
					data-cursor-badge
					class="rounded px-1 py-0.5 text-[10px] font-medium text-white"
					style="background-color: {cursor.user.color};"
				>{cursor.user.name}</span>
			</div>
		{/each}
	</div>
{/if}
