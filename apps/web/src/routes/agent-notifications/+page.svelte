<script lang="ts">
  type NotificationKind = "permission-prompt" | "input-needed" | "error";
  type Notification = { id: string; session: string; kind: NotificationKind; title: string; body: string; persistent: boolean };

  let notifications = $state<Notification[]>([]);
  let permissionGranted = $state(false);
  let focusedSession = $state<string | null>(null);
  let awayFromApp = $state(false);

  function requestPermission(): void {
    permissionGranted = true;
    notifications = [...notifications, { id: `n${notifications.length + 1}`, session: "session-1", kind: "permission-prompt", title: "Notifications enabled", body: "Browser permission granted.", persistent: false }];
  }

  function simulateInputNeeded(): void {
    notifications = [...notifications, { id: `n${notifications.length + 1}`, session: "session-2", kind: "input-needed", title: "session-2 needs input", body: "/approve required to continue.", persistent: awayFromApp }];
  }

  function simulateError(): void {
    notifications = [...notifications, { id: `n${notifications.length + 1}`, session: "session-3", kind: "error", title: "session-3 failed", body: "Tool call exited non-zero.", persistent: awayFromApp }];
  }

  function click(id: string): void {
    const n = notifications.find((x) => x.id === id);
    if (!n) return;
    focusedSession = n.session;
    if (!n.persistent) notifications = notifications.filter((x) => x.id !== id);
  }

  function setAway(value: boolean): void { awayFromApp = value; }
</script>

<svelte:head><title>Notifications | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6" data-notifications-page>
  <h1 class="text-2xl font-semibold">Session notifications</h1>

  <div class="flex flex-wrap gap-2">
    <button type="button" data-notif-permission onclick={requestPermission} disabled={permissionGranted} class="rounded-md border border-border px-3 py-1 text-xs">
      {permissionGranted ? "Permission granted" : "Request permission"}
    </button>
    <button type="button" data-notif-simulate-input onclick={simulateInputNeeded} class="rounded-md border border-border px-3 py-1 text-xs">Simulate input needed</button>
    <button type="button" data-notif-simulate-error onclick={simulateError} class="rounded-md border border-border px-3 py-1 text-xs">Simulate error</button>
    <label class="flex items-center gap-1 text-xs">
      <input type="checkbox" data-notif-away checked={awayFromApp} onchange={(e) => setAway((e.target as HTMLInputElement).checked)} />
      Away from app (persistent notifications)
    </label>
  </div>

  {#if focusedSession}
    <p data-notif-focused class="text-xs text-primary">Focused session: {focusedSession}</p>
  {/if}

  <ul class="space-y-2" data-notif-list>
    {#each notifications as n}
      <li
        data-notif-row={n.id}
        data-notif-kind={n.kind}
        data-notif-session={n.session}
        data-notif-persistent={n.persistent}
        class="rounded-md border border-border p-3"
      >
        <button type="button" data-notif-click={n.id} onclick={() => click(n.id)} class="block w-full text-left">
          <strong class="text-sm">{n.title}</strong>
          <p class="text-xs text-muted-foreground">{n.body}</p>
        </button>
      </li>
    {/each}
  </ul>
</main>
