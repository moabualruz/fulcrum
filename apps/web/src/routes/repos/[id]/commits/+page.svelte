<script lang="ts">
	import type { PageData } from "./$types";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import { buttonVariants } from "@fulcrum/ui-kit";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function formatDate(value: string): string {
		return value.slice(0, 16).replace("T", " ");
	}

	/** Gravatar URL from email (fallback via identicon). */
	function gravatarUrl(email: string, size = 24): string {
		// MD5 not available natively in browser without library;
		// use a deterministic UI-Avatars fallback based on initials.
		const initials = email.slice(0, 2).toUpperCase();
		return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&size=${size}&background=random`;
	}
</script>

{#await data.streamed.data}
	<RouteSkeleton kind="list" />
{:then payload}
	{@const repo = payload.repo}

	<header
		data-commits-header
		class={cn("flex items-center gap-2 border-b border-border pb-4 mb-6")}
	>
		<a href="/repos/{repo.id}" class={cn("text-muted-foreground hover:underline text-sm")}>{repo.slug}</a>
		<span class={cn("text-muted-foreground")}>/</span>
		<h1 class={cn("text-lg font-semibold tracking-tight")}>Commits</h1>
		<span class={cn("ml-auto text-xs text-muted-foreground")}>{payload.total} total</span>
	</header>

	{#if payload.commits.length === 0}
		<div
			data-empty-commits
			class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
		>No commits found.</div>
	{:else}
		<ul data-commit-log class={cn("space-y-0 divide-y divide-border")}>
			{#each payload.commits as commit (commit.sha)}
				<li
					data-commit-entry
					data-sha={commit.sha}
					class={cn("flex items-center gap-3 py-3 text-sm")}
				>
					<img
						src={gravatarUrl(commit.email)}
						alt={commit.author}
						width="24"
						height="24"
						class={cn("rounded-full shrink-0")}
					/>
					<code
						data-sha-display
						class={cn("font-mono text-xs text-muted-foreground w-20 shrink-0")}
					>{commit.shortSha}</code>
					<span class={cn("flex-1 truncate")}>{commit.message}</span>
					<span class={cn("text-xs text-muted-foreground shrink-0 hidden sm:block")}>{commit.author}</span>
					<span class={cn("font-mono text-xs text-muted-foreground shrink-0")}>{formatDate(commit.date)}</span>
				</li>
			{/each}
		</ul>

		<!-- Pagination -->
		{#if payload.totalPages > 1}
			<nav
				data-pagination
				class={cn("flex items-center justify-between pt-4 mt-4 border-t border-border")}
				aria-label="Commit log pagination"
			>
				{#if payload.page > 1}
					<a
						href="?page={payload.page - 1}"
						class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
					>← Prev</a>
				{:else}
					<span></span>
				{/if}

				<span class={cn("text-xs text-muted-foreground")}>
					Page {payload.page} of {payload.totalPages}
				</span>

				{#if payload.page < payload.totalPages}
					<a
						href="?page={payload.page + 1}"
						class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
					>Next →</a>
				{:else}
					<span></span>
				{/if}
			</nav>
		{/if}
	{/if}
{/await}
