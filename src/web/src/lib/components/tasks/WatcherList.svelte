<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    taskId: string;
    currentUserId?: string;
  }

  const { taskId, currentUserId = "" }: Props = $props();

  interface Watcher {
    id: string;
    userId: string;
    source: "manual" | "mention" | "assign" | "create";
    user?: {
      id: string;
      name: string;
      email: string;
      avatarUrl?: string;
    };
  }

  const MAX_VISIBLE = 5;
  const EMOJI_SOURCES: Record<string, string> = {
    manual: "Subscribed manually",
    mention: "Mentioned in comment",
    assign: "Assigned to task",
    create: "Created task",
  };

  let watchers = $state<Watcher[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let subscribing = $state(false);
  let hoveredWatcherId = $state<string | null>(null);

  const isSubscribed = $derived(watchers.some((w) => w.userId === currentUserId));
  const visibleWatchers = $derived(watchers.slice(0, MAX_VISIBLE));
  const overflowCount = $derived(Math.max(0, watchers.length - MAX_VISIBLE));

  function initials(name: string): string {
    return name.split(" ").slice(0, 2).map((n) => n[0] ?? "").join("").toUpperCase();
  }

  async function loadWatchers(): Promise<void> {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/trpc/comments.watchers?input=${encodeURIComponent(JSON.stringify({ taskId }))}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { result?: { data?: Watcher[] } };
      watchers = json.result?.data ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load watchers";
    } finally {
      loading = false;
    }
  }

  async function toggleSubscribe(): Promise<void> {
    subscribing = true;
    try {
      const procedure = isSubscribed ? "comments.unsubscribe" : "comments.subscribe";
      const res = await fetch("/api/trpc/" + procedure, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadWatchers();
    } catch (e) {
      error = e instanceof Error ? e.message : "Action failed";
    } finally {
      subscribing = false;
    }
  }

  onMount(() => {
    void loadWatchers();
  });
</script>

<div class="watcher-list" data-testid="watcher-list">
  <div class="watcher-list__header">
    <span class="watcher-list__label">Watchers</span>
    <button
      class="watcher-list__subscribe-btn"
      class:subscribed={isSubscribed}
      disabled={subscribing}
      onclick={toggleSubscribe}
      aria-label={isSubscribed ? "Unsubscribe from notifications" : "Subscribe to notifications"}
    >
      {#if subscribing}
        ...
      {:else if isSubscribed}
        Watching
      {:else}
        Watch
      {/if}
    </button>
  </div>

  {#if loading}
    <div class="watcher-list__loading">Loading...</div>
  {:else if error}
    <div class="watcher-list__error">{error}</div>
  {:else if watchers.length === 0}
    <div class="watcher-list__empty">No watchers yet.</div>
  {:else}
    <div class="watcher-list__avatars" aria-label={`${watchers.length} watcher${watchers.length !== 1 ? "s" : ""}`}>
      {#each visibleWatchers as watcher (watcher.id)}
        <div
          class="watcher-list__avatar-wrapper"
          role="img"
          aria-label={`${watcher.user?.name ?? watcher.userId} — ${EMOJI_SOURCES[watcher.source] ?? watcher.source}`}
          onmouseenter={() => { hoveredWatcherId = watcher.id; }}
          onmouseleave={() => { hoveredWatcherId = null; }}
        >
          {#if watcher.user?.avatarUrl}
            <img
              class="watcher-list__avatar"
              src={watcher.user.avatarUrl}
              alt={watcher.user.name}
              width="24"
              height="24"
            />
          {:else}
            <div class="watcher-list__avatar watcher-list__avatar--initials">
              {initials(watcher.user?.name ?? watcher.userId.slice(0, 2))}
            </div>
          {/if}

          {#if hoveredWatcherId === watcher.id}
            <div class="watcher-list__tooltip">
              <div class="watcher-list__tooltip-name">{watcher.user?.name ?? watcher.userId}</div>
              <div class="watcher-list__tooltip-source">{EMOJI_SOURCES[watcher.source] ?? watcher.source}</div>
            </div>
          {/if}
        </div>
      {/each}

      {#if overflowCount > 0}
        <div class="watcher-list__overflow" aria-label={`${overflowCount} more watchers`}>
          +{overflowCount}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .watcher-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .watcher-list__header {
    align-items: center;
    display: flex;
    gap: 0.75rem;
  }

  .watcher-list__label {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .watcher-list__subscribe-btn {
    background: transparent;
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    transition: background 0.1s, color 0.1s;
  }

  .watcher-list__subscribe-btn:hover:not(:disabled) {
    background: hsl(var(--accent, 210 40% 96%));
  }

  .watcher-list__subscribe-btn.subscribed {
    background: hsl(var(--primary, 222 47% 11%));
    border-color: hsl(var(--primary, 222 47% 11%));
    color: hsl(var(--primary-foreground, 210 40% 98%));
  }

  .watcher-list__subscribe-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .watcher-list__avatars {
    align-items: center;
    display: flex;
  }

  .watcher-list__avatar-wrapper {
    margin-left: -8px;
    position: relative;
  }

  .watcher-list__avatar-wrapper:first-child {
    margin-left: 0;
  }

  .watcher-list__avatar {
    border: 2px solid hsl(var(--background, 0 0% 100%));
    border-radius: 50%;
    display: block;
    height: 24px;
    object-fit: cover;
    width: 24px;
  }

  .watcher-list__avatar--initials {
    align-items: center;
    background: hsl(var(--muted, 210 40% 96%));
    color: hsl(var(--muted-foreground, 215 16% 47%));
    display: flex;
    font-size: 0.625rem;
    font-weight: 600;
    justify-content: center;
  }

  .watcher-list__overflow {
    align-items: center;
    background: hsl(var(--muted, 210 40% 96%));
    border: 2px solid hsl(var(--background, 0 0% 100%));
    border-radius: 50%;
    color: hsl(var(--muted-foreground, 215 16% 47%));
    display: flex;
    font-size: 0.625rem;
    font-weight: 600;
    height: 24px;
    justify-content: center;
    margin-left: -8px;
    width: 24px;
  }

  .watcher-list__tooltip {
    background: hsl(var(--popover, 0 0% 100%));
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.375rem;
    bottom: calc(100% + 4px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    left: 50%;
    padding: 0.375rem 0.625rem;
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;
    z-index: 50;
  }

  .watcher-list__tooltip-name {
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .watcher-list__tooltip-source {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.75rem;
  }

  .watcher-list__loading,
  .watcher-list__empty,
  .watcher-list__error {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.875rem;
  }

  .watcher-list__error {
    color: hsl(var(--destructive, 0 84% 60%));
  }
</style>
