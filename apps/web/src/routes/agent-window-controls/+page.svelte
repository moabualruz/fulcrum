<script lang="ts">
  let alwaysOnTop = $state(false);
  let transparent = $state(false);
  let minimizedToTray = $state(false);
  let unread = $state(3);

  function toggleTop(): void { alwaysOnTop = !alwaysOnTop; }
  function toggleTransparency(): void { transparent = !transparent; }
  function minimizeToTray(): void { minimizedToTray = true; }
  function restoreFromTray(): void { minimizedToTray = false; unread = 0; }
</script>

<svelte:head><title>Window controls | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6 hidden md:block" data-window-controls-page data-window-mobile-hidden>
  <h1 class="text-2xl font-semibold">Desktop window controls</h1>
  <p class="text-sm text-muted-foreground">Desktop-only controls (mobile hides this surface).</p>

  <div class="grid gap-2">
    <button type="button" data-window-toggle-top data-window-top-state={alwaysOnTop} onclick={toggleTop} class="rounded-md border border-border bg-background px-3 py-2 text-sm">
      Always on top: {alwaysOnTop ? "ON" : "OFF"} (Cmd+Shift+T)
    </button>
    <button type="button" data-window-toggle-transparency data-window-transparency-state={transparent} onclick={toggleTransparency} class="rounded-md border border-border bg-background px-3 py-2 text-sm">
      Transparency: {transparent ? "ON" : "OFF"}
    </button>
    <button type="button" data-window-minimize-tray onclick={minimizeToTray} class="rounded-md border border-border bg-background px-3 py-2 text-sm">Minimize to tray</button>
  </div>

  {#if minimizedToTray}
    <button type="button" data-window-tray-icon onclick={restoreFromTray} class="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs">
      <span aria-hidden="true">▣</span>
      Tray
      {#if unread > 0}
        <span data-window-tray-badge class="rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{unread}</span>
      {/if}
    </button>
  {/if}
</main>
