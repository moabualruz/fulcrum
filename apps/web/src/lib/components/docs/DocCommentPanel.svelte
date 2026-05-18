<script lang="ts">
  import { cn } from "$lib/utils.js";
  import { buttonVariants } from "@fulcrum/ui-kit";
  import CheckIcon from "@lucide/svelte/icons/check";
  import MessageSquareIcon from "@lucide/svelte/icons/message-square";
  import UserIcon from "@lucide/svelte/icons/user";
  import SendIcon from "@lucide/svelte/icons/send";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

  interface Author {
    id: string;
    name?: string | null;
    email?: string | null;
  }

  interface Comment {
    id: string;
    bodyMd: string;
    anchorRange: Record<string, unknown> | null;
    author: Author | null;
    parentComment: { id: string } | null;
    resolved: boolean;
    createdAt: Date | string;
    updatedAt: Date | string;
  }

  interface Props {
    documentId: string;
    comments?: Comment[];
    open?: boolean;
    onResolve?: (commentId: string) => Promise<void>;
    onAddComment?: (bodyMd: string, anchorRange?: Record<string, unknown>, parentCommentId?: string) => Promise<void>;
  }

  let {
    documentId,
    comments = [],
    open = $bindable(false),
    onResolve,
    onAddComment,
  }: Props = $props();

  // UI state
  let replyTo = $state<string | null>(null);
  let replyText = $state("");
  let newCommentText = $state("");
  let expandedResolved = $state<Record<string, boolean>>({});
  let resolving = $state<Record<string, boolean>>({});
  let submitting = $state(false);

  /** Top-level comments (no parent) */
  const rootComments = $derived(comments.filter((c) => !c.parentComment));

  /** Get direct replies for a comment (1 level deep) */
  function getReplies(parentId: string): Comment[] {
    return comments.filter((c) => c.parentComment?.id === parentId);
  }

  function formatRelative(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return diffD < 30 ? `${diffD}d ago` : d.toLocaleDateString();
  }

  function authorInitial(author: Author | null): string {
    if (!author) return "?";
    const name = author.name ?? author.email ?? "?";
    return name[0]?.toUpperCase() ?? "?";
  }

  function authorLabel(author: Author | null): string {
    if (!author) return "Unknown";
    return author.name ?? author.email ?? "Unknown";
  }

  async function handleResolve(commentId: string) {
    if (!onResolve) return;
    resolving = { ...resolving, [commentId]: true };
    try {
      await onResolve(commentId);
    } finally {
      resolving = { ...resolving, [commentId]: false };
    }
  }

  async function handleReply(parentId: string) {
    if (!onAddComment || !replyText.trim()) return;
    submitting = true;
    try {
      await onAddComment(replyText.trim(), undefined, parentId);
      replyText = "";
      replyTo = null;
    } finally {
      submitting = false;
    }
  }

  async function handleNewComment() {
    if (!onAddComment || !newCommentText.trim()) return;
    submitting = true;
    try {
      await onAddComment(newCommentText.trim());
      newCommentText = "";
    } finally {
      submitting = false;
    }
  }
</script>

<!-- 300px inline panel that slides in from the right, pushing editor content -->
{#if open}
  <aside
    data-doc-comment-panel
    data-document-id={documentId}
    class={cn(
      "flex h-full w-[300px] shrink-0 flex-col border-l border-border bg-background",
    )}
  >
    <!-- Header -->
    <header class={cn("flex items-center justify-between gap-2 border-b border-border px-4 py-3")}>
      <h2 class={cn("flex items-center gap-2 text-sm font-semibold")}>
        <MessageSquareIcon class={cn("size-4")} />
        Comments
      </h2>
      <button
        data-close-comments
        class={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-6")}
        onclick={() => { open = false; }}
        aria-label="Close comments"
      >
        <ChevronRightIcon class={cn("size-4")} />
      </button>
    </header>

    <!-- Comment list -->
    <div class={cn("flex flex-1 flex-col gap-0 overflow-y-auto")}>
      {#if rootComments.length === 0}
        <p class={cn("px-4 py-8 text-center text-sm text-muted-foreground")}>No comments yet.</p>
      {:else}
        {#each rootComments as comment (comment.id)}
          {@const replies = getReplies(comment.id)}

          {#if comment.resolved}
            <!-- Collapsed resolved comment -->
            <div
              data-comment-resolved={comment.id}
              class={cn("border-b border-border/50 px-4 py-2")}
            >
              <button
                class={cn("flex w-full items-center gap-2 text-xs text-muted-foreground hover:text-foreground")}
                onclick={() => { expandedResolved = { ...expandedResolved, [comment.id]: !expandedResolved[comment.id] }; }}
              >
                <CheckIcon class={cn("size-3 text-green-600")} />
                <span class={cn("flex-1 text-left truncate")}>Resolved · {authorLabel(comment.author)}</span>
                {#if expandedResolved[comment.id]}
                  <span class={cn("text-xs")}>▲</span>
                {:else}
                  <span class={cn("text-xs")}>▼</span>
                {/if}
              </button>

              {#if expandedResolved[comment.id]}
                <div class={cn("mt-2 pl-5 text-xs text-muted-foreground")}>{comment.bodyMd}</div>
              {/if}
            </div>
          {:else}
            <!-- Active comment thread -->
            <div
              data-comment-thread={comment.id}
              class={cn("border-b border-border px-4 py-3")}
            >
              <!-- Root comment -->
              <div data-comment={comment.id} class={cn("flex gap-2")}>
                <!-- Author avatar -->
                <span class={cn("grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground self-start mt-0.5")}>
                  {#if comment.author}
                    {authorInitial(comment.author)}
                  {:else}
                    <UserIcon class={cn("size-3")} />
                  {/if}
                </span>

                <div class={cn("min-w-0 flex-1")}>
                  <!-- Author + timestamp -->
                  <div class={cn("flex items-baseline gap-2 mb-1")}>
                    <span class={cn("text-xs font-semibold")}>{authorLabel(comment.author)}</span>
                    <span class={cn("text-xs text-muted-foreground")}>{formatRelative(comment.createdAt)}</span>
                  </div>

                  <!-- Anchor indicator -->
                  {#if comment.anchorRange}
                    <div
                      data-anchor-range={JSON.stringify(comment.anchorRange)}
                      class={cn("mb-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground font-mono")}
                    >
                      Anchored to selection
                    </div>
                  {/if}

                  <!-- Body -->
                  <p class={cn("text-sm leading-snug whitespace-pre-wrap")}>{comment.bodyMd}</p>

                  <!-- Actions -->
                  <div class={cn("mt-2 flex items-center gap-2")}>
                    <button
                      class={cn("text-xs text-muted-foreground hover:text-foreground")}
                      onclick={() => { replyTo = replyTo === comment.id ? null : comment.id; }}
                    >Reply</button>
                    <button
                      data-resolve-comment={comment.id}
                      class={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-5 text-muted-foreground hover:text-green-600")}
                      onclick={() => handleResolve(comment.id)}
                      disabled={resolving[comment.id]}
                      title="Resolve comment"
                      aria-label="Resolve comment"
                    >
                      <CheckIcon class={cn("size-3")} />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Replies (indented 24px, max 2 levels shown) -->
              {#each replies as reply (reply.id)}
                {@const nestedReplies = getReplies(reply.id).slice(0, 10)}
                <div
                  data-comment={reply.id}
                  class={cn("mt-2 flex gap-2")}
                  style="padding-left: 24px;"
                >
                  <span class={cn("grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground self-start mt-0.5")}>
                    {authorInitial(reply.author)}
                  </span>
                  <div class={cn("min-w-0 flex-1")}>
                    <div class={cn("flex items-baseline gap-2 mb-0.5")}>
                      <span class={cn("text-xs font-semibold")}>{authorLabel(reply.author)}</span>
                      <span class={cn("text-xs text-muted-foreground")}>{formatRelative(reply.createdAt)}</span>
                    </div>
                    <p class={cn("text-sm leading-snug whitespace-pre-wrap")}>{reply.bodyMd}</p>
                    {#if !reply.resolved}
                      <button
                        data-resolve-comment={reply.id}
                        class={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-5 mt-1 text-muted-foreground hover:text-green-600")}
                        onclick={() => handleResolve(reply.id)}
                        disabled={resolving[reply.id]}
                        title="Resolve reply"
                        aria-label="Resolve reply"
                      >
                        <CheckIcon class={cn("size-3")} />
                      </button>
                    {/if}

                    <!-- Level-2 replies -->
                    {#each nestedReplies as nested (nested.id)}
                      <div class={cn("mt-2 flex gap-2")} style="padding-left: 24px;">
                        <span class={cn("grid size-4 shrink-0 place-items-center rounded-full bg-muted text-[8px] font-medium text-muted-foreground")}>{authorInitial(nested.author)}</span>
                        <div class={cn("min-w-0 flex-1")}>
                          <span class={cn("text-xs font-semibold")}>{authorLabel(nested.author)}</span>
                          <span class={cn("ml-1 text-xs text-muted-foreground")}>{formatRelative(nested.createdAt)}</span>
                          <p class={cn("text-sm whitespace-pre-wrap")}>{nested.bodyMd}</p>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}

              <!-- Reply compose (inline) -->
              {#if replyTo === comment.id}
                <div class={cn("mt-2 flex gap-2")} style="padding-left: 24px;">
                  <textarea
                    data-reply-input={comment.id}
                    bind:value={replyText}
                    placeholder="Reply…"
                    rows={2}
                    class={cn("flex-1 min-w-0 rounded border border-input bg-background px-2 py-1.5 text-sm resize-none")}
                    onkeydown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { void handleReply(comment.id); }
                      if (e.key === "Escape") { replyTo = null; replyText = ""; }
                    }}
                  ></textarea>
                  <button
                    class={cn(buttonVariants({ variant: "default", size: "icon" }), "size-8 shrink-0 self-end")}
                    onclick={() => void handleReply(comment.id)}
                    disabled={submitting || !replyText.trim()}
                    aria-label="Send reply"
                  >
                    <SendIcon class={cn("size-3.5")} />
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      {/if}
    </div>

    <!-- New comment compose -->
    <div class={cn("border-t border-border p-3")}>
      <div class={cn("flex gap-2 items-end")}>
        <textarea
          data-new-comment-input
          bind:value={newCommentText}
          placeholder="Add a comment…"
          rows={2}
          class={cn("flex-1 min-w-0 rounded border border-input bg-background px-2 py-1.5 text-sm resize-none")}
          onkeydown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { void handleNewComment(); }
          }}
        ></textarea>
        <button
          data-submit-comment
          class={cn(buttonVariants({ variant: "default", size: "icon" }), "size-8 shrink-0")}
          onclick={() => void handleNewComment()}
          disabled={submitting || !newCommentText.trim()}
          aria-label="Submit comment"
        >
          <SendIcon class={cn("size-3.5")} />
        </button>
      </div>
    </div>
  </aside>
{/if}
