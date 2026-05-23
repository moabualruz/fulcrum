<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { cn } from "@fulcrum/ui-kit";

  export interface CommentThread {
    id: string;
    bodyMd: string;
    anchorRange?: Record<string, unknown> | null;
    resolved?: boolean;
    replies?: CommentThread[];
  }

  interface Props {
    threads?: CommentThread[];
    resolvedThreads?: CommentThread[];
    readonly?: boolean;
    onhighlight?: (event: CustomEvent<{ id: string; anchorRange: Record<string, unknown> | null }>) => void;
    onreply?: (event: CustomEvent<{ parentCommentId: string; bodyMd: string }>) => void;
    onresolve?: (event: CustomEvent<{ id: string }>) => void;
    onreopen?: (event: CustomEvent<{ id: string }>) => void;
  }

  let {
    threads = [],
    resolvedThreads = [],
    readonly = false,
    onhighlight,
    onreply,
    onresolve,
    onreopen,
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    highlight: { id: string; anchorRange: Record<string, unknown> | null };
    reply: { parentCommentId: string; bodyMd: string };
    resolve: { id: string };
    reopen: { id: string };
  }>();

  let showResolved = $state(false);
  let replies = $state<Record<string, string>>({});

  const orderedThreads = $derived([...threads].sort((left, right) => anchorFrom(left) - anchorFrom(right)));

  function anchorFrom(thread: CommentThread): number {
    const from = thread.anchorRange?.from;
    return typeof from === "number" ? from : Number.MAX_SAFE_INTEGER;
  }

  function preview(thread: CommentThread): string {
    const text = thread.anchorRange?.text_preview;
    return typeof text === "string" && text ? text : "Document selection";
  }

  function sendReply(thread: CommentThread): void {
    const bodyMd = (replies[thread.id] ?? "").trim();
    if (!bodyMd) return;
    emitReply({ parentCommentId: thread.id, bodyMd });
    replies = { ...replies, [thread.id]: "" };
  }

  function emitHighlight(detail: { id: string; anchorRange: Record<string, unknown> | null }): void {
    dispatch("highlight", detail);
    onhighlight?.(new CustomEvent("highlight", { detail }));
  }

  function emitReply(detail: { parentCommentId: string; bodyMd: string }): void {
    dispatch("reply", detail);
    onreply?.(new CustomEvent("reply", { detail }));
  }

  function emitResolve(detail: { id: string }): void {
    dispatch("resolve", detail);
    onresolve?.(new CustomEvent("resolve", { detail }));
  }

  function emitReopen(detail: { id: string }): void {
    dispatch("reopen", detail);
    onreopen?.(new CustomEvent("reopen", { detail }));
  }
</script>

<aside
  data-testid="comments-panel"
  data-readonly={readonly ? "true" : "false"}
  class={cn("flex h-full min-w-72 flex-col gap-3 border-l border-border bg-background p-4")}
>
  <div class={cn("flex items-center justify-between gap-3")}>
    <h2 class={cn("text-sm font-semibold")}>Comments</h2>
    <span data-comment-count class={cn("rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground")}>
      {orderedThreads.length}
    </span>
  </div>

  <div class={cn("flex flex-col gap-3")}>
    {#each orderedThreads as thread (thread.id)}
      <section
        role="listitem"
        data-testid="comment-thread"
        data-comment-thread={thread.id}
        class={cn("rounded-md border border-border p-3")}
        onmouseenter={() => emitHighlight({ id: thread.id, anchorRange: thread.anchorRange ?? null })}
      >
        <div class={cn("flex items-start justify-between gap-3")}>
          <div>
            <p class={cn("text-xs text-muted-foreground")}>{preview(thread)}</p>
            <p class={cn("mt-1 text-sm")}>{thread.bodyMd}</p>
          </div>
          {#if !readonly}
            <button
              type="button"
              aria-label="Resolve {thread.bodyMd}"
              class={cn("h-7 rounded-md border border-input px-2 text-xs")}
              onclick={() => emitResolve({ id: thread.id })}
            >Resolve</button>
          {/if}
        </div>

        {#if thread.replies?.length}
          <div class={cn("mt-3 flex flex-col gap-2 border-l border-border pl-3")}>
            {#each thread.replies as reply (reply.id)}
              <p class={cn("text-sm text-muted-foreground")}>{reply.bodyMd}</p>
            {/each}
          </div>
        {/if}

        {#if !readonly}
          <div class={cn("mt-3 flex gap-2")}>
            <input
              aria-label="Reply to {thread.bodyMd}"
              value={replies[thread.id] ?? ""}
              oninput={(event) => (replies = { ...replies, [thread.id]: event.currentTarget.value })}
              class={cn("h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm")}
            />
            <button
              type="button"
              aria-label="Send reply to {thread.bodyMd}"
              class={cn("h-8 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground")}
              onclick={() => sendReply(thread)}
            >Reply</button>
          </div>
        {/if}
      </section>
    {/each}
  </div>

  {#if resolvedThreads.length}
    <button
      type="button"
      aria-label="Show resolved threads"
      aria-expanded={showResolved}
      class={cn("mt-2 h-8 rounded-md border border-input px-2 text-xs")}
      onclick={() => (showResolved = !showResolved)}
    >Resolved ({resolvedThreads.length})</button>

    {#if showResolved}
      <div class={cn("flex flex-col gap-2")}>
        {#each resolvedThreads as thread (thread.id)}
          <section data-resolved-thread={thread.id} class={cn("rounded-md border border-dashed border-border p-3 opacity-80")}>
            <p class={cn("text-sm")}>{thread.bodyMd}</p>
            {#if !readonly}
              <button
                type="button"
                aria-label="Re-open {thread.bodyMd}"
                class={cn("mt-2 h-7 rounded-md border border-input px-2 text-xs")}
                onclick={() => emitReopen({ id: thread.id })}
              >Re-open</button>
            {/if}
          </section>
        {/each}
      </div>
    {/if}
  {/if}
</aside>
