<script lang="ts">
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { buttonVariants } from "$lib/components/ui/button";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const ICON_MAP: Record<string, string> = {
    task: "check-square",
    doc: "file-text",
    project: "folder",
    run: "play",
  };

  function entityIcon(kind: string): string {
    return ICON_MAP[kind] ?? "bell";
  }

  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
</script>

<header
  data-inbox-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Inbox</h1>
</header>

<nav data-inbox-tabs class={cn("mb-4 flex gap-2")}>
  <a
    href="/inbox"
    data-tab-notifications
    class={cn(
      buttonVariants({ variant: data.tab === "notifications" ? "default" : "outline", size: "sm" }),
    )}
  >For you</a>
  <a
    href="/inbox?tab=activity"
    data-tab-activity
    class={cn(
      buttonVariants({ variant: data.tab === "activity" ? "default" : "outline", size: "sm" }),
    )}
  >My activity</a>
</nav>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {#if "notifications" in payload}
    {@const notifications = payload.notifications}
    {#if notifications.length === 0}
      <div
        data-empty-inbox
        class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
      >No notifications yet.</div>
    {:else}
      <div data-inbox-badge class={cn("mb-3 text-sm text-muted-foreground")}>
        {payload.unreadCount} unread
      </div>
      <ul data-notification-list class={cn("space-y-2")}>
        {#each notifications as notification (notification.id)}
          <li
            data-notification-card
            data-notification-id={notification.id}
            class={cn(
              "flex items-start gap-3 rounded-lg border p-3 transition-colors",
              notification.read_at ? "border-border bg-background" : "border-primary/20 bg-primary/5",
            )}
          >
            <span data-notification-icon class={cn("mt-0.5 text-muted-foreground text-sm")}>
              {entityIcon(notification.entity_kind)}
            </span>
            <div class={cn("min-w-0 flex-1")}>
              <p data-notification-title class={cn("text-sm font-medium leading-tight")}>
                {notification.title}
              </p>
              <p class={cn("text-xs text-muted-foreground mt-0.5")}>
                <span data-notification-actor>{notification.actor}</span>
                <span class="mx-1">&middot;</span>
                <span data-notification-verb>{notification.verb}</span>
                <span class="mx-1">&middot;</span>
                <time data-notification-time>{timeAgo(notification.created_at)}</time>
              </p>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if "events" in payload}
    {@const events = payload.events}
    {#if events.length === 0}
      <div
        data-empty-activity
        class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
      >No activity yet.</div>
    {:else}
      <ul data-activity-list class={cn("space-y-2")}>
        {#each events as event (event.id)}
          <li
            data-activity-card
            data-event-id={event.id}
            class={cn("flex items-start gap-3 rounded-lg border border-border p-3")}
          >
            <div class={cn("min-w-0 flex-1")}>
              <p class={cn("text-sm font-medium")}>
                <span data-activity-kind>{event.subject_kind}</span>
                <span class="mx-1">&middot;</span>
                <span data-activity-verb>{event.verb}</span>
              </p>
              <p class={cn("text-xs text-muted-foreground mt-0.5")}>
                <span data-activity-actor>{event.actor}</span>
                <span class="mx-1">&middot;</span>
                <time data-activity-time>{timeAgo(event.created_at)}</time>
              </p>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
{/await}
