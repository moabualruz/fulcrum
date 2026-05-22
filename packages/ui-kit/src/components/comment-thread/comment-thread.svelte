<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	/**
	 * Authorship of a comment: a human reviewer or an AI agent. DESIGN.md §9.1
	 * + OD `review.html` `av agent` / `claude-opus-4.7` authorship: agent comments
	 * carry a distinct avatar treatment so reviewer vs agent voice is legible at a
	 * glance. `you` is the current operator (OD `av you`).
	 */
	export type CommentAuthorKind = "human" | "agent" | "you";

	/** A single comment inside a thread (OD `annot-row .comment`). */
	export interface ThreadComment {
		/** Stable id: the `data-comment-thread-comment` hook + keyed-each key. */
		id: string;
		/** Display name (OD `.meta strong`). */
		author: string;
		/** Comment body text (OD `.text`). */
		body: string;
		/** Relative timestamp (OD `.meta span`: `2m`, `just now`). */
		ts: string;
		/** Author kind: selects the avatar treatment. Defaults to `human`. */
		kind?: CommentAuthorKind;
		/** Optional context label after the name (OD `· sec-review` / `· agent`). */
		context?: string;
	}

	/**
	 * The visible state of a comment thread: DESIGN.md §9.1 comment-thread
	 * states. The OD diff `comment-mark` (resolved/unresolved), the
	 * `comments-block-thread` resolvable/faded markers, and the failed-save /
	 * permission-denied recovery states all collapse to this one enum so the
	 * design gate can assert each branch.
	 *
	 *  - `open`       : unresolved, accepting replies (OD `annot-row`);
	 *  - `resolved`   : closed, faded but still readable (OD `comment-mark.resolved`);
	 *  - `empty`      : anchored but no comments yet (start-thread affordance);
	 *  - `failed-save`: a reply failed to persist; retry affordance shown;
	 *  - `permission` : the viewer may read but not reply.
	 */
	export type CommentThreadState =
		| "open"
		| "resolved"
		| "empty"
		| "failed-save"
		| "permission";

	export type CommentThreadProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		/** Stable thread id: the `data-comment-thread` hook. */
		threadId: string;
		/**
		 * The anchor the thread is attached to: a diff line, a doc block, a PR
		 * region (OD `comment-thread .anchor` / `note-card .where`). Selection text
		 * is shown as a quote when present.
		 */
		anchorLabel: string;
		/** Optional quoted source text (OD `note-card .quote` / anchored code line). */
		quote?: string;
		/** Short anchor chip text (OD `.anchor-chip`: `session.ts:46`). */
		anchorChip?: string;
		/** The comments in the thread (OD `annot-row` comments). */
		comments?: readonly ThreadComment[];
		/** The thread state: drives resolved fade, empty branch, recovery copy. */
		threadState?: CommentThreadState;
		/**
		 * Initial draft reply text seeded into the composer. The composer textarea
		 * owns its draft after mount; this is a one-way seed (e.g. a template).
		 */
		reply?: string;
		/** Show the inline reply composer (suppressed for `resolved`/`permission`). */
		showComposer?: boolean;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		threadId,
		anchorLabel,
		quote,
		anchorChip,
		comments = [],
		threadState = "open",
		reply = "",
		showComposer = true,
		class: className,
		children,
		...restProps
	}: CommentThreadProps = $props();

	/** A two-letter monogram from an author name (OD `.av` content). */
	function monogram(name: string): string {
		const trimmed = name.trim();
		if (trimmed.toLowerCase() === "you") return "mk";
		return trimmed
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0] ?? "")
			.join("")
			.toUpperCase();
	}

	/** The composer's own draft text, synced when the upstream reply changes. */
	let draft = $state("");

	$effect(() => {
		draft = reply;
	});

	/** Whether the inline composer renders (open + failed-save + empty accept replies). */
	const composerVisible = $derived(
		showComposer && threadState !== "resolved" && threadState !== "permission",
	);

	/** Whether the start-thread affordance shows (anchored but no comments). */
	const isEmpty = $derived(threadState === "empty" || comments.length === 0);
</script>

<section
	bind:this={ref}
	aria-label={`Comment thread for ${anchorLabel}`}
	data-slot="comment-thread"
	data-comment-thread={threadId}
	data-thread-state={threadState}
	data-resolved={threadState === "resolved" ? "true" : "false"}
	class={cn(
		"flex flex-col gap-2 rounded-md border bg-card font-sans text-xs",
		threadState === "open" && "border-accent/45",
		threadState === "resolved" && "border-border opacity-60",
		threadState === "empty" && "border-dashed border-border",
		threadState === "failed-save" && "border-destructive/55",
		threadState === "permission" && "border-border",
		className,
	)}
	{...restProps}
>
	<!-- Anchor: the diff line / doc block / PR region the thread is attached to. -->
	<header
		data-slot="comment-thread-anchor"
		class="flex items-center gap-2 border-b border-border px-3 py-2 text-muted-foreground"
	>
		<span data-slot="comment-thread-anchor-label" class="min-w-0 truncate font-medium">
			{anchorLabel}
		</span>
		<span class="flex-1"></span>
		{#if anchorChip}
			<span
				data-slot="comment-thread-anchor-chip"
				class="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground"
			>
				{anchorChip}
			</span>
		{/if}
	</header>

	{#if quote}
		<div
			data-slot="comment-thread-quote"
			data-thread-selection="true"
			class="mx-3 rounded-sm border border-border bg-muted/60 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
		>
			{quote}
		</div>
	{/if}

	{#if isEmpty}
		<!-- DESIGN.md §9.1 `empty` state: anchored, no comments yet. -->
		<p data-slot="comment-thread-empty" class="px-3 py-2.5 text-muted-foreground">
			No comments on this anchor yet.
		</p>
	{:else}
		<ul data-slot="comment-thread-comments" data-thread-comments="true" class="flex flex-col">
			{#each comments as comment (comment.id)}
				{@const kind = comment.kind ?? "human"}
				<li
					data-comment-thread-comment={comment.id}
					data-thread-comment={comment.id}
					data-comment-author-kind={kind}
					class="flex gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0"
				>
					<span
						data-slot="comment-thread-avatar"
						aria-hidden="true"
						class={cn(
							"flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-primary-foreground",
							kind === "agent" && "bg-success",
							kind === "you" && "bg-primary",
							kind === "human" && "bg-accent",
						)}
					>
						{kind === "agent" ? "AI" : monogram(comment.author)}
					</span>
					<div class="min-w-0 flex-1">
						<div
							data-slot="comment-thread-meta"
							class="flex flex-wrap items-baseline gap-1.5 text-muted-foreground"
						>
							<strong class="text-foreground">{comment.author}</strong>
							{#if comment.context}
								<span>· {comment.context}</span>
							{/if}
							<span>· {comment.ts}</span>
						</div>
						<p data-slot="comment-thread-body" class="mt-0.5 leading-relaxed text-foreground">
							{comment.body}
						</p>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if threadState === "resolved"}
		<p data-slot="comment-thread-resolved" data-thread-resolved="true" class="px-3 pb-2.5 text-muted-foreground">
			Resolved: kept as a faded reference.
		</p>
	{:else if threadState === "permission"}
		<!-- DESIGN.md §9.1 `permission-denied`: read-only, no composer. -->
		<p data-slot="comment-thread-permission" class="px-3 pb-2.5 text-muted-foreground">
			You can read this thread but do not have permission to reply.
		</p>
	{/if}

	{#if threadState === "failed-save"}
		<!-- DESIGN.md §9.1 `failed-save`: the last reply did not persist. -->
		<p
			data-slot="comment-thread-failed-save"
			role="alert"
			class="mx-3 rounded-sm border border-destructive/55 bg-destructive/10 px-2.5 py-1.5 text-destructive"
		>
			Reply failed to save. Retry to post it.
		</p>
	{/if}

	{#if composerVisible}
		<div
			data-slot="comment-thread-composer"
			class="flex items-start gap-2 border-t border-border px-3 py-2.5"
		>
			<span
				aria-hidden="true"
				class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground"
			>
				mk
			</span>
			<textarea
				data-slot="comment-thread-reply-input"
				data-comment-thread-reply-input={threadId}
				data-thread-reply-input={threadId}
				bind:value={draft}
				rows="2"
				placeholder={isEmpty ? "Start a thread on this anchor… (⌘↵ to submit)" : "Reply… (⌘↵ to submit)"}
				aria-label={`Reply to thread ${threadId}`}
				class={cn(
					"flex-1 resize-y rounded-sm border border-border bg-background px-2.5 py-1.5",
					"font-sans text-xs text-foreground placeholder:text-muted-foreground",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
				)}
			></textarea>
		</div>
	{/if}

	{#if children}
		<footer
			data-slot="comment-thread-actions"
			class="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2"
		>
			{@render children()}
		</footer>
	{/if}
</section>
