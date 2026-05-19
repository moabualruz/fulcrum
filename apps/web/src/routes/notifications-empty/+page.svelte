<script lang="ts">
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
    <section data-notif-empty class="space-y-2 rounded-md border border-dashed border-border p-6 text-center">
      <p class="text-base font-medium">No notifications yet</p>
      <p class="text-sm text-muted-foreground">When someone @mentions you, assigns a task, or comments on your doc, it shows up here.</p>
      <button type="button" data-notif-empty-cta onclick={addOne} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Add a sample notification</button>
    </section>
  {:else}
    <ul class="space-y-2" data-notif-list>
      {#each notifications as n}
        <li data-notif-list-row={n.id} class="rounded-md border border-border p-3">
          <strong class="text-sm">{n.title}</strong>
          <p class="text-xs text-muted-foreground">{n.body}</p>
        </li>
      {/each}
    </ul>
    <button type="button" data-notif-clear onclick={clearAll} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Clear all</button>
  {/if}
</main>
