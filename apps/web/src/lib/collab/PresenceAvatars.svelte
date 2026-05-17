<script lang="ts">
	import type { CollabUser } from "./types.js";

	interface Props {
		users: CollabUser[];
	}

	let { users }: Props = $props();
</script>

{#if users.length > 0}
	<div data-presence-avatars class="flex -space-x-2">
		{#each users as user (user.id)}
			<div
				data-presence-avatar
				data-user-id={user.id}
				title={user.name}
				class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background text-xs font-semibold text-white"
				style="background-color: {user.color};"
			>
				{user.name.charAt(0).toUpperCase()}
			</div>
		{/each}
	</div>
{/if}
