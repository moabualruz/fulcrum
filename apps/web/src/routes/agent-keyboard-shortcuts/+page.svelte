<script lang="ts">
  type Shortcut = { keys: string; action: string; scope: "global" | "session" | "input" };

  const SHORTCUTS: Shortcut[] = [
    { keys: "Cmd/Ctrl+K", action: "Focus command palette", scope: "global" },
    { keys: "Cmd/Ctrl+Tab", action: "Next session", scope: "global" },
    { keys: "Cmd/Ctrl+Shift+Tab", action: "Previous session", scope: "global" },
    { keys: "Cmd/Ctrl+L", action: "Clear chat input", scope: "input" },
    { keys: "Cmd/Ctrl+Z", action: "Abort current operation", scope: "session" },
    { keys: "Enter", action: "Submit message (desktop)", scope: "input" },
    { keys: "Shift+Enter", action: "Insert newline (desktop)", scope: "input" },
    { keys: "?", action: "Show this cheat sheet", scope: "global" },
  ];

  let showCheatSheet = $state(false);
  let lastShortcut = $state<string | null>(null);

  function openCheatSheet(): void { showCheatSheet = true; }
  function closeCheatSheet(): void { showCheatSheet = false; }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "?") {
      event.preventDefault();
      openCheatSheet();
      return;
    }
    if (event.key === "Escape" && showCheatSheet) {
      event.preventDefault();
      closeCheatSheet();
      return;
    }
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "k") { event.preventDefault(); lastShortcut = "palette"; }
    else if (mod && event.key.toLowerCase() === "l") { event.preventDefault(); lastShortcut = "clear-input"; }
    else if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); lastShortcut = "abort"; }
  }
</script>

<svelte:head><title>Keyboard shortcuts | Fulcrum</title></svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main class="mx-auto max-w-2xl space-y-4 p-6" data-shortcuts-page>
  <h1 class="text-2xl font-semibold">Keyboard shortcuts</h1>
  <p class="text-sm text-muted-foreground">Press <kbd>?</kbd> to open the cheat sheet. Press <kbd>Esc</kbd> to close.</p>

  <button type="button" data-shortcuts-show onclick={openCheatSheet} class="rounded-md border border-border bg-background px-3 py-1 text-sm">Show cheat sheet</button>

  {#if lastShortcut}
    <p data-shortcuts-last class="text-xs text-muted-foreground">Last triggered: {lastShortcut}</p>
  {/if}

  {#if showCheatSheet}
    <div role="dialog" aria-label="Keyboard shortcut cheat sheet" data-shortcuts-cheatsheet class="rounded-md border border-border bg-background p-4">
      <header class="mb-2 flex items-center justify-between">
        <h2 class="text-base font-medium">Shortcuts</h2>
        <button type="button" data-shortcuts-close onclick={closeCheatSheet} aria-label="Close cheat sheet" class="rounded-md border border-border px-2 py-1 text-xs">Close</button>
      </header>
      <ul class="space-y-1 text-sm">
        {#each SHORTCUTS as s}
          <li data-shortcut-row={s.keys} class="flex items-center justify-between gap-3">
            <kbd class="rounded-md border border-border bg-muted px-2 py-0.5 text-xs">{s.keys}</kbd>
            <span class="flex-1 text-left">{s.action}</span>
            <span class="text-xs text-muted-foreground">{s.scope}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</main>
