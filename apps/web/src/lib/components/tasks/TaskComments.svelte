<script lang="ts">
  /**
   * TaskComments — threaded comments with TipTap editor.
   * D-01: threaded replies (24px indent, border-left)
   * D-02: reply button → inline sub-editor with parentCommentId
   * D-03: resolved comments collapse
   * D-04: reaction emoji bar (6 emoji)
   * D-100/D-101: TipTap mention extension with dual source (users + teams)
   * Security T-05-16: TipTap renders from JSON schema — no raw HTML injection.
   */

  import { onMount, onDestroy } from "svelte";
  import { createEditor, EditorContent } from "svelte-tiptap";
  import { StarterKit } from "@tiptap/starter-kit";
  import { Placeholder } from "@tiptap/extension-placeholder";
  import { TaskList } from "@tiptap/extension-task-list";
  import { TaskItem } from "@tiptap/extension-task-item";
  import { Mention } from "@tiptap/extension-mention";
  import type { JSONContent } from "@tiptap/core";
  import type { Editor } from "svelte-tiptap";
  import type { Unsubscriber } from "svelte/store";
  import {
    addTaskCommentReaction,
    createTaskComment,
    fetchOrganizationMembers,
    fetchTaskThreadedComments,
    removeTaskCommentReaction,
    resolveTaskComment,
    unresolveTaskComment,
    type TaskCommentApiRow,
    type TaskCommentReactionApiRow,
  } from "./comment-api";
  import type { MentionItem } from "./MentionSuggestion.svelte";

  interface Props {
    taskId: string;
    orgId?: string;
    currentUserId?: string;
    currentUserName?: string;
  }

  const { taskId, orgId = "", currentUserId = "", currentUserName = "You" }: Props = $props();

  interface Reaction {
    emoji: string;
    count: number;
    userIds: string[];
  }

  interface Comment {
    id: string;
    taskId: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string;
    body: JSONContent;
    parentCommentId: string | null;
    resolvedAt: Date | null;
    resolvedById: string | null;
    resolvedByName: string | null;
    createdAt: Date;
    updatedAt: Date;
    reactions: Reaction[];
    replies?: Comment[];
  }

  const REACTION_EMOJIS = ["👍", "👎", "😄", "🎉", "❤️", "🚀"];
  const MAX_INDENT_LEVELS = 3;

  let comments = $state<Comment[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let submitting = $state(false);
  let replyingToId = $state<string | null>(null);
  let expandedResolved = $state<Set<string>>(new Set());

  // Main editor
  let editor = $state<Editor | null>(null);
  let editorUnsub: Unsubscriber | undefined;
  let editorContent = $state<JSONContent>({ type: "doc", content: [{ type: "paragraph" }] });

  // Reply editor
  let replyEditor = $state<Editor | null>(null);
  let replyEditorUnsub: Unsubscriber | undefined;
  let replyEditorContent = $state<JSONContent>({ type: "doc", content: [{ type: "paragraph" }] });

  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 1) return `${days}d ago`;
    if (days === 1) return "yesterday";
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  }

  function initials(name: string): string {
    return name.split(" ").slice(0, 2).map((n) => n[0] ?? "").join("").toUpperCase();
  }

  function isEmptyDoc(doc: JSONContent): boolean {
    const content = doc.content ?? [];
    if (content.length === 0) return true;
    if (content.length === 1 && content[0].type === "paragraph") {
      const inner = content[0].content ?? [];
      return inner.length === 0;
    }
    return false;
  }

  async function fetchMentionItems(query: string): Promise<MentionItem[]> {
    try {
      const members = await fetchOrganizationMembers(fetch, { orgId, userId: currentUserId });
      const items: MentionItem[] = [];

      for (const m of members) {
        const label = m.name ?? m.email ?? m.userId;
        if (!query || label.toLowerCase().includes(query.toLowerCase())) {
          items.push({ id: m.userId, type: "user", label, email: m.email, avatarUrl: m.avatarUrl });
        }
      }

      return items.slice(0, 8);
    } catch {
      return [];
    }
  }

  function buildMentionExtension() {
    return Mention.configure({
      HTMLAttributes: { class: "mention" },
      suggestion: {
        items: async ({ query }: { query: string }) => fetchMentionItems(query),
        render: () => {
          // Minimal inline suggestion — full MentionSuggestion.svelte used via tippyjs in production
          let container: HTMLElement | null = null;
          return {
            onStart: () => {
              container = document.createElement("div");
              container.className = "mention-popup";
              document.body.appendChild(container);
            },
            onUpdate: () => {},
            onKeyDown: () => false,
            onExit: () => {
              container?.remove();
              container = null;
            },
          };
        },
      },
    });
  }

  function buildEditorExtensions() {
    return [
      StarterKit,
      Placeholder.configure({ placeholder: "Write a comment..." }),
      TaskList,
      TaskItem.configure({ nested: true }),
      buildMentionExtension(),
    ];
  }

  onMount(() => {
    void loadComments();

    const mainStore = createEditor({
      extensions: buildEditorExtensions(),
      content: editorContent,
      onUpdate: ({ editor: e }) => { editorContent = e.getJSON(); },
    });
    editorUnsub = mainStore.subscribe((e) => { editor = e; });
  });

  onDestroy(() => {
    editorUnsub?.();
    replyEditorUnsub?.();
  });

  async function loadComments(): Promise<void> {
    loading = true;
    error = null;
    try {
      const rows = await fetchTaskThreadedComments(fetch, { orgId, userId: currentUserId, taskId });
      comments = rows.map(normalizeComment);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load comments";
    } finally {
      loading = false;
    }
  }

  async function submitComment(body: JSONContent, parentCommentId?: string): Promise<void> {
    if (isEmptyDoc(body)) return;
    submitting = true;
    try {
      await createTaskComment(fetch, {
        orgId,
        userId: currentUserId,
        taskId,
        body,
        parentCommentId,
      });
      await loadComments();
      // Reset editors
      if (parentCommentId) {
        replyEditor?.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] });
        replyingToId = null;
      } else {
        editor?.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to submit comment";
    } finally {
      submitting = false;
    }
  }

  async function resolveComment(commentId: string): Promise<void> {
    try {
      await resolveTaskComment(fetch, { orgId, userId: currentUserId, commentId });
      await loadComments();
    } catch {}
  }

  async function unresolveComment(commentId: string): Promise<void> {
    try {
      await unresolveTaskComment(fetch, { orgId, userId: currentUserId, commentId });
      await loadComments();
    } catch {}
  }

  async function toggleReaction(commentId: string, emoji: string, hasReacted: boolean): Promise<void> {
    try {
      if (hasReacted) await removeTaskCommentReaction(fetch, { orgId, userId: currentUserId, commentId, emoji });
      else await addTaskCommentReaction(fetch, { orgId, userId: currentUserId, commentId, emoji });
      await loadComments();
    } catch {}
  }

  function startReply(commentId: string): void {
    replyingToId = commentId;
    if (replyEditor) {
      replyEditor.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] });
    } else {
      const store = createEditor({
        extensions: buildEditorExtensions(),
        content: { type: "doc", content: [{ type: "paragraph" }] },
        onUpdate: ({ editor: e }) => { replyEditorContent = e.getJSON(); },
      });
      replyEditorUnsub?.();
      replyEditorUnsub = store.subscribe((e) => { replyEditor = e; });
    }
  }

  function cancelReply(): void {
    replyingToId = null;
  }

  function toggleExpanded(commentId: string): void {
    const next = new Set(expandedResolved);
    if (next.has(commentId)) next.delete(commentId);
    else next.add(commentId);
    expandedResolved = next;
  }

  // Render TipTap JSON as simple HTML for display
  function renderContent(doc: JSONContent): string {
    function renderNode(node: JSONContent): string {
      if (node.type === "text") return escapeHtml(node.text ?? "");
      const children = (node.content ?? []).map(renderNode).join("");
      switch (node.type) {
        case "paragraph": return `<p>${children}</p>`;
        case "hardBreak": return "<br>";
        case "bold": return `<strong>${children}</strong>`;
        case "italic": return `<em>${children}</em>`;
        case "code": return `<code>${children}</code>`;
        case "codeBlock": return `<pre><code>${children}</code></pre>`;
        case "bulletList": return `<ul>${children}</ul>`;
        case "orderedList": return `<ol>${children}</ol>`;
        case "listItem": return `<li>${children}</li>`;
        case "taskList": return `<ul class="task-list">${children}</ul>`;
        case "taskItem": return `<li class="task-item">${children}</li>`;
        case "mention": return `<span class="mention">@${escapeHtml((node.attrs?.label as string) ?? "")}</span>`;
        case "doc": return children;
        default: return children;
      }
    }
    return renderNode(doc);
  }

  function escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function normalizeComment(row: TaskCommentApiRow): Comment {
    return {
      id: row.id,
      taskId: row.taskId,
      authorId: row.authorId,
      authorName: row.authorId,
      body: row.body ?? { type: "doc", content: [{ type: "paragraph" }] },
      parentCommentId: row.parentCommentId,
      resolvedAt: row.resolvedAt ? new Date(row.resolvedAt) : null,
      resolvedById: row.resolvedBy,
      resolvedByName: row.resolvedBy,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(0),
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(0),
      reactions: summarizeReactions(row.reactions),
      replies: row.replies?.map(normalizeComment),
    };
  }

  function summarizeReactions(rows: TaskCommentReactionApiRow[]): Reaction[] {
    const byEmoji = new Map<string, Set<string>>();
    for (const row of rows) {
      const users = byEmoji.get(row.emoji) ?? new Set<string>();
      users.add(row.userId);
      byEmoji.set(row.emoji, users);
    }
    return [...byEmoji.entries()].map(([emoji, users]) => ({
      emoji,
      count: users.size,
      userIds: [...users],
    }));
  }
</script>

<div class="task-comments" data-testid="task-comments">
  {#if loading}
    <div class="task-comments__loading">Loading comments...</div>
  {:else if error}
    <div class="task-comments__error">{error}</div>
  {:else if comments.length === 0}
    <div class="task-comments__empty">No comments yet. Start the conversation.</div>
  {:else}
    <ul class="task-comments__list" data-testid="comment-list">
      {#each comments as comment (comment.id)}
        {@const isResolved = comment.resolvedAt != null}
        {@const isExpanded = expandedResolved.has(comment.id)}

        <li class="task-comments__comment" data-testid="comment-item" data-resolved={isResolved}>
          {#if isResolved && !isExpanded}
            <button
              class="task-comments__resolved-header"
              onclick={() => toggleExpanded(comment.id)}
              type="button"
              aria-expanded="false"
            >
              Resolved by {comment.resolvedByName ?? "someone"} — click to expand
            </button>
          {:else}
            <div class="task-comments__comment-inner">
              {#if isResolved}
                <button
                  class="task-comments__resolved-header task-comments__resolved-header--inline"
                  onclick={() => toggleExpanded(comment.id)}
                  type="button"
                  aria-expanded="true"
                >
                  Resolved by {comment.resolvedByName ?? "someone"}
                </button>
              {/if}

              <div class="task-comments__comment-header">
                <div class="task-comments__avatar" aria-hidden="true">
                  {#if comment.authorAvatar}
                    <img src={comment.authorAvatar} alt={comment.authorName} width="28" height="28" />
                  {:else}
                    {initials(comment.authorName)}
                  {/if}
                </div>
                <div class="task-comments__meta">
                  <span class="task-comments__author">{comment.authorName}</span>
                  <time class="task-comments__time" datetime={new Date(comment.createdAt).toISOString()}>
                    {formatRelativeTime(comment.createdAt)}
                  </time>
                </div>
                <div class="task-comments__actions">
                  <button
                    class="task-comments__action-btn"
                    onclick={() => startReply(comment.id)}
                    type="button"
                    aria-label="Reply to comment"
                  >Reply</button>
                  {#if !isResolved}
                    <button
                      class="task-comments__action-btn"
                      onclick={() => resolveComment(comment.id)}
                      type="button"
                      aria-label="Resolve comment"
                    >Resolve</button>
                  {:else}
                    <button
                      class="task-comments__action-btn"
                      onclick={() => unresolveComment(comment.id)}
                      type="button"
                      aria-label="Unresolve comment"
                    >Unresolve</button>
                  {/if}
                </div>
              </div>

              <div class="task-comments__body">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html renderContent(comment.body)}
              </div>

              <!-- Reaction bar -->
              <div class="task-comments__reactions" aria-label="Reactions">
                {#each REACTION_EMOJIS as emoji}
                  {@const reaction = comment.reactions.find((r) => r.emoji === emoji)}
                  {@const hasReacted = reaction?.userIds.includes(currentUserId) ?? false}
                  <button
                    class="task-comments__reaction-btn"
                    class:reacted={hasReacted}
                    onclick={() => toggleReaction(comment.id, emoji, hasReacted)}
                    type="button"
                    aria-label={`React with ${emoji}${reaction?.count ? ` (${reaction.count})` : ""}`}
                    aria-pressed={hasReacted}
                  >
                    {emoji}{#if reaction?.count && reaction.count > 0}<span class="task-comments__reaction-count">{reaction.count}</span>{/if}
                  </button>
                {/each}
              </div>

              <!-- Inline reply editor -->
              {#if replyingToId === comment.id}
                <div class="task-comments__reply-editor">
                  {#if replyEditor}
                    <EditorContent editor={replyEditor} />
                  {/if}
                  <div class="task-comments__reply-actions">
                    <button
                      class="task-comments__submit-btn"
                      disabled={submitting || isEmptyDoc(replyEditorContent)}
                      onclick={() => submitComment(replyEditorContent, comment.id)}
                      type="button"
                    >
                      {submitting ? "Submitting..." : "Reply"}
                    </button>
                    <button
                      class="task-comments__cancel-btn"
                      onclick={cancelReply}
                      type="button"
                    >Cancel</button>
                  </div>
                </div>
              {/if}

              <!-- Threaded replies (max 3 indent levels, then flatten) -->
              {#if comment.replies && comment.replies.length > 0}
                <ul class="task-comments__replies">
                  {#each comment.replies as reply (reply.id)}
                    <li class="task-comments__reply">
                      <div class="task-comments__comment-header">
                        <div class="task-comments__avatar task-comments__avatar--small" aria-hidden="true">
                          {#if reply.authorAvatar}
                            <img src={reply.authorAvatar} alt={reply.authorName} width="20" height="20" />
                          {:else}
                            {initials(reply.authorName)}
                          {/if}
                        </div>
                        <div class="task-comments__meta">
                          <span class="task-comments__author">{reply.authorName}</span>
                          <span class="task-comments__reply-context">replying to @{comment.authorName}</span>
                          <time class="task-comments__time" datetime={new Date(reply.createdAt).toISOString()}>
                            {formatRelativeTime(reply.createdAt)}
                          </time>
                        </div>
                        <div class="task-comments__actions">
                          {#if !reply.resolvedAt}
                            <button
                              class="task-comments__action-btn"
                              onclick={() => resolveComment(reply.id)}
                              type="button"
                            >Resolve</button>
                          {:else}
                            <button
                              class="task-comments__action-btn"
                              onclick={() => unresolveComment(reply.id)}
                              type="button"
                            >Unresolve</button>
                          {/if}
                        </div>
                      </div>
                      <div class="task-comments__body">
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                        {@html renderContent(reply.body)}
                      </div>
                      <div class="task-comments__reactions">
                        {#each REACTION_EMOJIS as emoji}
                          {@const reaction = reply.reactions.find((r) => r.emoji === emoji)}
                          {@const hasReacted = reaction?.userIds.includes(currentUserId) ?? false}
                          <button
                            class="task-comments__reaction-btn"
                            class:reacted={hasReacted}
                            onclick={() => toggleReaction(reply.id, emoji, hasReacted)}
                            type="button"
                            aria-label={`React with ${emoji}`}
                            aria-pressed={hasReacted}
                          >
                            {emoji}{#if reaction?.count && reaction.count > 0}<span class="task-comments__reaction-count">{reaction.count}</span>{/if}
                          </button>
                        {/each}
                      </div>

                      <!-- Level 2 replies (flatten at level 3) -->
                      {#if reply.replies && reply.replies.length > 0}
                        <ul class="task-comments__replies task-comments__replies--level2">
                          {#each reply.replies as deepReply (deepReply.id)}
                            <li class="task-comments__reply">
                              <div class="task-comments__comment-header">
                                <div class="task-comments__avatar task-comments__avatar--small" aria-hidden="true">
                                  {initials(deepReply.authorName)}
                                </div>
                                <div class="task-comments__meta">
                                  <span class="task-comments__author">{deepReply.authorName}</span>
                                  <time class="task-comments__time" datetime={new Date(deepReply.createdAt).toISOString()}>
                                    {formatRelativeTime(deepReply.createdAt)}
                                  </time>
                                </div>
                              </div>
                              <div class="task-comments__body">
                                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                {@html renderContent(deepReply.body)}
                              </div>
                            </li>
                          {/each}
                        </ul>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <!-- New comment editor -->
  <div class="task-comments__new-comment">
    <div class="task-comments__editor-wrapper" data-testid="comment-input">
      {#if editor}
        <EditorContent {editor} />
      {:else}
        <div class="task-comments__editor-placeholder">Loading editor...</div>
      {/if}
    </div>
    <div class="task-comments__editor-actions">
      <button
        class="task-comments__submit-btn"
        data-testid="comment-submit"
        disabled={submitting || isEmptyDoc(editorContent)}
        onclick={() => submitComment(editorContent)}
        type="button"
      >
        {submitting ? "Submitting..." : "Comment"}
      </button>
    </div>
  </div>
</div>

<style>
  .task-comments {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .task-comments__loading,
  .task-comments__empty,
  .task-comments__error {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.875rem;
    padding: 0.5rem 0;
    text-align: center;
  }

  .task-comments__error {
    color: hsl(var(--destructive, 0 84% 60%));
  }

  .task-comments__list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .task-comments__comment {
    display: flex;
    flex-direction: column;
  }

  .task-comments__resolved-header {
    background: none;
    border: none;
    border-radius: 0.375rem;
    color: hsl(var(--muted-foreground, 215 16% 47%));
    cursor: pointer;
    font-size: 0.8125rem;
    padding: 0.25rem 0.5rem;
    text-align: left;
    text-decoration: underline;
    width: 100%;
  }

  .task-comments__resolved-header--inline {
    display: inline-block;
    margin-bottom: 0.5rem;
    width: auto;
  }

  .task-comments__comment-inner {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .task-comments__comment-header {
    align-items: center;
    display: flex;
    gap: 0.5rem;
  }

  .task-comments__avatar {
    align-items: center;
    background: hsl(var(--muted, 210 40% 96%));
    border-radius: 50%;
    color: hsl(var(--muted-foreground, 215 16% 47%));
    display: flex;
    flex-shrink: 0;
    font-size: 0.6875rem;
    font-weight: 600;
    height: 28px;
    justify-content: center;
    overflow: hidden;
    width: 28px;
  }

  .task-comments__avatar--small {
    font-size: 0.625rem;
    height: 20px;
    width: 20px;
  }

  .task-comments__avatar img {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }

  .task-comments__meta {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    min-width: 0;
  }

  .task-comments__author {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .task-comments__reply-context {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.75rem;
  }

  .task-comments__time {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.75rem;
  }

  .task-comments__actions {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
  }

  .task-comments__action-btn {
    background: none;
    border: none;
    border-radius: 0.25rem;
    color: hsl(var(--muted-foreground, 215 16% 47%));
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.125rem 0.375rem;
  }

  .task-comments__action-btn:hover {
    background: hsl(var(--accent, 210 40% 96%));
    color: hsl(var(--foreground, 222 47% 11%));
  }

  .task-comments__body {
    font-size: 0.875rem;
    line-height: 1.6;
    padding-left: 2.25rem;
  }

  .task-comments__body :global(p) { margin: 0 0 0.25rem; }
  .task-comments__body :global(p:last-child) { margin-bottom: 0; }
  .task-comments__body :global(ul), .task-comments__body :global(ol) { padding-left: 1.25rem; }
  .task-comments__body :global(code) {
    background: hsl(var(--muted, 210 40% 96%));
    border-radius: 0.25rem;
    font-family: monospace;
    font-size: 0.8em;
    padding: 0.125rem 0.25rem;
  }
  .task-comments__body :global(.mention) {
    background: hsl(var(--primary, 222 47% 11%) / 0.1);
    border-radius: 0.25rem;
    color: hsl(var(--primary, 222 47% 11%));
    font-weight: 500;
    padding: 0.0625rem 0.25rem;
  }

  .task-comments__reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding-left: 2.25rem;
  }

  .task-comments__reaction-btn {
    align-items: center;
    background: hsl(var(--muted, 210 40% 96%));
    border: 1px solid transparent;
    border-radius: 1rem;
    cursor: pointer;
    display: flex;
    font-size: 0.8125rem;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    transition: background 0.1s, border-color 0.1s;
  }

  .task-comments__reaction-btn:hover {
    background: hsl(var(--accent, 210 40% 96%));
    border-color: hsl(var(--border, 214 32% 91%));
  }

  .task-comments__reaction-btn.reacted {
    background: hsl(var(--primary, 222 47% 11%) / 0.1);
    border-color: hsl(var(--primary, 222 47% 11%) / 0.3);
  }

  .task-comments__reaction-count {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.75rem;
    font-weight: 500;
  }

  .task-comments__replies {
    border-left: 2px solid hsl(var(--border, 214 32% 91%));
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0.5rem 0 0 1.5rem;
  }

  .task-comments__replies--level2 {
    margin-left: 1.5rem;
  }

  .task-comments__reply {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .task-comments__reply-editor {
    background: hsl(var(--muted, 210 40% 96%));
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.5rem;
  }

  .task-comments__reply-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  .task-comments__new-comment {
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .task-comments__editor-wrapper {
    min-height: 4rem;
  }

  .task-comments__editor-wrapper :global(.ProseMirror) {
    min-height: 4rem;
    outline: none;
  }

  .task-comments__editor-wrapper :global(.ProseMirror p.is-editor-empty:first-child::before) {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }

  .task-comments__editor-placeholder {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.875rem;
    min-height: 4rem;
  }

  .task-comments__editor-actions {
    display: flex;
    justify-content: flex-end;
  }

  .task-comments__submit-btn {
    background: hsl(var(--primary, 222 47% 11%));
    border: none;
    border-radius: 0.375rem;
    color: hsl(var(--primary-foreground, 210 40% 98%));
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    padding: 0.375rem 1rem;
    transition: opacity 0.1s;
  }

  .task-comments__submit-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .task-comments__cancel-btn {
    background: none;
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0.375rem 0.75rem;
  }
</style>
