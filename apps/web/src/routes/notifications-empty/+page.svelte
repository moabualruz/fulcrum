<script lang="ts">
  import { Button, EmptyState } from "@fulcrum/ui-kit";

  type Notification = { id: string; title: string; body: string };

  let notifications = $state<Notification[]>([]);

  function addOne(): void {
    notifications = [...notifications, { id: `n${notifications.length + 1}`, title: "New mention", body: "@you was mentioned in a comment." }];
  }

  function clearAll(): void { notifications = []; }
</script>

<svelte:head><title>Notifications | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6" data-notif-empty-page>
  <h1 class="text-2xl font-semibold">Notifications</h1>

  {#if notifications.length === 0}
    <EmptyState
      data-notif-empty
      title="No notifications yet"
      description="When someone @mentions you, assigns a task, or comments on your doc, it shows up here."
    >
      {#snippet actions()}
        <Button size="sm" data-notif-empty-cta onclick={addOne}>Add a sample notification</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <ul class="space-y-2" data-notif-list>
      {#each notifications as n}
        <li data-notif-list-row={n.id} class="rounded-md border border-border p-3">
          <strong class="text-sm">{n.title}</strong>
          <p class="text-xs text-muted-foreground">{n.body}</p>
        </li>
      {/each}
    </ul>
    <Button variant="outline" size="sm" data-notif-clear onclick={clearAll}>Clear all</Button>
  {/if}
</main>
