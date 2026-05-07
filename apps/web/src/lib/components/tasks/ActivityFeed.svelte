<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    taskId: string;
  }

  const { taskId }: Props = $props();

  interface AuditEvent {
    id: string;
    userId: string | null;
    verb: string;
    subjectKind: string;
    subjectId: string | null;
    payload: Record<string, unknown> | null;
    createdAt: Date;
  }

  let events = $state<AuditEvent[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 1) return `${days} days ago`;
    if (days === 1) return "yesterday";
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  }

  function formatEventDescription(event: AuditEvent): string {
    const payload = event.payload ?? {};
    const actor = (payload.actorName as string) ?? "Someone";
    const field = payload.fieldName as string | undefined;
    const from = payload.fromValue as string | undefined;
    const to = payload.toValue as string | undefined;

    if (event.verb === "task.updated" && field) {
      if (from && to) {
        return `${actor} changed ${field} from "${from}" to "${to}"`;
      }
      if (to) {
        return `${actor} set ${field} to "${to}"`;
      }
      return `${actor} updated ${field}`;
    }

    switch (event.verb) {
      case "task.created": return `${actor} created this task`;
      case "task.deleted": return `${actor} deleted this task`;
      case "task.archived": return `${actor} archived this task`;
      case "task.assigned": return `${actor} assigned this task to ${to ?? "someone"}`;
      case "task.unassigned": return `${actor} unassigned this task`;
      case "task.status_changed": return `${actor} changed status from "${from}" to "${to}"`;
      case "task.priority_changed": return `${actor} changed priority`;
      case "comment.created": return `${actor} left a comment`;
      case "comment.resolved": return `${actor} resolved a comment`;
      default: return `${actor} performed action: ${event.verb}`;
    }
  }

  async function loadEvents(): Promise<void> {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/trpc/audit.list?input=${encodeURIComponent(JSON.stringify({ subjectId: taskId, subjectKind: "task", limit: 50 }))}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { result?: { data?: { items?: AuditEvent[] } } };
      events = json.result?.data?.items ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load activity";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadEvents();
  });
</script>

<div class="activity-feed" data-testid="activity-feed">
  {#if loading}
    <div class="activity-feed__loading">Loading activity...</div>
  {:else if error}
    <div class="activity-feed__error">Failed to load activity: {error}</div>
  {:else if events.length === 0}
    <div class="activity-feed__empty">No activity yet.</div>
  {:else}
    <ul class="activity-feed__list">
      {#each events as event (event.id)}
        <li class="activity-feed__item">
          <div class="activity-feed__dot"></div>
          <div class="activity-feed__content">
            <span class="activity-feed__description">{formatEventDescription(event)}</span>
            <time class="activity-feed__time" datetime={new Date(event.createdAt).toISOString()}>
              {formatRelativeTime(event.createdAt)}
            </time>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .activity-feed {
    padding: 0.5rem 0;
  }

  .activity-feed__loading,
  .activity-feed__empty,
  .activity-feed__error {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.875rem;
    padding: 1rem 0;
    text-align: center;
  }

  .activity-feed__error {
    color: hsl(var(--destructive, 0 84% 60%));
  }

  .activity-feed__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .activity-feed__item {
    align-items: flex-start;
    display: flex;
    gap: 0.75rem;
    padding: 0.5rem 0;
    position: relative;
  }

  .activity-feed__item:not(:last-child)::after {
    background: hsl(var(--border, 214 32% 91%));
    bottom: 0;
    content: "";
    left: 0.4375rem;
    position: absolute;
    top: 1.25rem;
    width: 1px;
  }

  .activity-feed__dot {
    background: hsl(var(--muted, 210 40% 96%));
    border: 2px solid hsl(var(--border, 214 32% 91%));
    border-radius: 50%;
    flex-shrink: 0;
    height: 0.875rem;
    margin-top: 0.25rem;
    width: 0.875rem;
  }

  .activity-feed__content {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .activity-feed__description {
    color: hsl(var(--foreground, 222 47% 11%));
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .activity-feed__time {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.75rem;
  }
</style>
