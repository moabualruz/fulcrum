<script lang="ts">
  import { cn } from "$lib/utils.js";
  import type { NotificationRow, ActivityRow } from "./+page.server.ts";

  interface Props {
    data: {
      notifications: NotificationRow[];
      unreadCount: number;
      activity: ActivityRow[];
      activityPage: number;
      activityTotal: number;
    };
  }

  let { data }: Props = $props();

  type Tab = "foryou" | "activity";
  let activeTab = $state<Tab>("foryou");

  const PAGE_SIZE = 20;
  const totalPages = $derived(Math.ceil(data.activityTotal / PAGE_SIZE));

  function formatDate(iso: string): string {
    return iso.slice(0, 16).replace("T", " ");
  }

  function activityPageHref(page: number): string {
    return `/inbox?activity_page=${page}`;
  }
</script>

<header class={cn("mb-4 flex items-center justify-between gap-4 border-b border-border pb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>
    Inbox
    {#if data.unreadCount > 0}
      <span
        data-bell-badge
        aria-live="polite"
        aria-label="{data.unreadCount} unread notifications"
        class={cn("ml-2 inline-flex items-center justify-center rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground")}
      >{data.unreadCount}</span>
    {/if}
  </h1>

  {#if data.unreadCount > 0}
    <form method="POST" action="?/markAllRead">
      <button
        type="submit"
        data-mark-all-read
        class={cn("rounded border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent")}
      >Mark all read</button>
    </form>
  {/if}
</header>

<!-- Tab bar: ARIA tablist/tab/tabpanel pattern -->
<div data-inbox-tabs role="tablist" aria-label="Inbox sections" class={cn("mb-4 flex gap-2 border-b border-border")}>
  <button
    type="button"
    role="tab"
    id="tab-foryou"
    aria-selected={activeTab === "foryou"}
    aria-controls="panel-foryou"
    data-tab="foryou"
    class={cn(
      "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
      activeTab === "foryou"
        ? "border-foreground text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    )}
    onclick={() => (activeTab = "foryou")}
  >For you</button>
  <button
    type="button"
    role="tab"
    id="tab-activity"
    aria-selected={activeTab === "activity"}
    aria-controls="panel-activity"
    data-tab="activity"
    class={cn(
      "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
      activeTab === "activity"
        ? "border-foreground text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    )}
    onclick={() => (activeTab = "activity")}
  >My activity</button>
</div>

<!-- For you tab -->
{#if activeTab === "foryou"}
  <div
    data-tab-foryou
    role="tabpanel"
    id="panel-foryou"
    aria-labelledby="tab-foryou"
    tabindex="0"
  >
    {#if data.notifications.length === 0}
      <div
        data-inbox-empty
        class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
      >No notifications.</div>
    {:else}
      <ul class={cn("divide-y divide-border rounded-md border border-border")}>
        {#each data.notifications as n (n.id)}
          <li
            data-notification={n.id}
            class={cn("flex items-start gap-3 p-3", n.readAt === null ? "bg-accent/30" : "")}
          >
            {#if n.readAt === null}
              <span
                data-unread-dot
                aria-label="Unread"
                role="img"
                class={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary")}
              ></span>
            {:else}
              <span aria-hidden="true" class={cn("mt-1.5 h-2 w-2 shrink-0")}></span>
            {/if}
            <div>
              <p class={cn("text-sm font-medium")}>
                <span data-notification-actor>{n.title}</span>
                {" "}<span data-notification-verb>{n.body}</span>
                {" "}<span data-notification-subject>{n.entityKind}:{n.entityId}</span>
              </p>
              <p class={cn("mt-0.5 text-xs text-muted-foreground")} data-notification-time>
                {formatDate(n.createdAt)}
              </p>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<!-- My activity tab -->
{#if activeTab === "activity"}
  <div
    data-tab-activity
    role="tabpanel"
    id="panel-activity"
    aria-labelledby="tab-activity"
    tabindex="0"
  >
    {#if data.activity.length === 0}
      <div
        data-activity-empty
        class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
      >No activity yet.</div>
    {:else}
      <ul class={cn("divide-y divide-border rounded-md border border-border")}>
        {#each data.activity as ev (ev.id)}
          <li data-activity-row={ev.id} class={cn("p-3")}>
            <p class={cn("text-sm")}>
              <span data-activity-verb class={cn("font-medium")}>{ev.verb}</span>
              {" "}<span data-activity-subject>{ev.subject_kind}:{ev.subject_id}</span>
              {#if ev.project_id}
                <span class={cn("text-xs text-muted-foreground")}> (project {ev.project_id})</span>
              {/if}
            </p>
            <p class={cn("mt-0.5 text-xs text-muted-foreground")} data-activity-time>
              {formatDate(ev.created_at)}
            </p>
          </li>
        {/each}
      </ul>

      {#if totalPages > 1}
        <nav data-activity-pagination class={cn("mt-4 flex items-center gap-2 text-sm")}>
          {#if data.activityPage > 1}
            <a href={activityPageHref(data.activityPage - 1)} class={cn("hover:underline")}>&larr; Prev</a>
          {/if}
          <span>Page {data.activityPage} of {totalPages}</span>
          {#if data.activityPage < totalPages}
            <a href={activityPageHref(data.activityPage + 1)} class={cn("hover:underline")}>Next &rarr;</a>
          {/if}
        </nav>
      {/if}
    {/if}
  </div>
{/if}
