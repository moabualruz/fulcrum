<script lang="ts">
  import { onMount } from "svelte";
  import { cn } from "$lib/utils.js";

  type ConnectionState = "offline" | "syncing" | "online";

  let connection = $state<ConnectionState>("offline");
  let lastSyncAt = $state(new Date("2026-05-18T08:42:00Z"));
  let queuedChanges = $state(3);
  let hydrated = $state(false);

  type PwaPromptState = "idle" | "available" | "accepted" | "dismissed";
  let pwaPromptState = $state<PwaPromptState>("available");
  let pwaInstallCount = $state(0);

  function acceptInstall(): void {
    pwaPromptState = "accepted";
    pwaInstallCount += 1;
  }
  function dismissInstall(): void {
    pwaPromptState = "dismissed";
  }
  function resetInstall(): void {
    pwaPromptState = "available";
  }

  const statusLabel = $derived(connection === "offline" ? "Offline" : connection === "syncing" ? "Syncing" : "Online");
  const bannerTone = $derived(connection === "online" ? "success" : connection === "syncing" ? "warning" : "danger");
  const lastSyncLabel = $derived(new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(lastSyncAt));

  function handleOffline(): void {
    connection = "offline";
    if (queuedChanges === 0) queuedChanges = 1;
  }

  function handleOnline(): void {
    if (connection === "offline" && queuedChanges === 0) connection = "online";
  }

  onMount(() => {
    hydrated = true;
    if (!navigator.onLine) handleOffline();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  });

  function syncNow(): void {
    connection = "syncing";
    window.setTimeout(() => {
      connection = "online";
      queuedChanges = 0;
      lastSyncAt = new Date("2026-05-18T09:00:00Z");
    }, 500);
  }

  function simulateOffline(): void {
    connection = "offline";
    queuedChanges = 3;
  }
</script>

<svelte:head>
  <title>Offline reconnect banner</title>
</svelte:head>

<main data-offline-page data-hydrated={hydrated} class={cn("min-h-screen overflow-x-hidden bg-background text-foreground")}>
  <div class={cn("mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 lg:px-6")}>
    <header class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4")}>
      <div>
        <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Operate · Connectivity</p>
        <h1 class={cn("text-2xl font-semibold tracking-normal")}>Offline reconnect state</h1>
      </div>
      <div class={cn("flex flex-wrap items-center gap-2 text-xs")}>
        <span data-status-pill data-tone={bannerTone} class={cn(
          "rounded-full border px-3 py-1 font-medium",
          connection === "online" && "border-success/30 bg-success/10 text-success",
          connection === "syncing" && "border-warning/35 bg-warning/10 text-warning",
          connection === "offline" && "border-destructive/30 bg-destructive/10 text-destructive",
        )}>{statusLabel}</span>
        <span data-last-sync-pill class={cn("rounded-full border border-border bg-muted px-3 py-1 font-medium")}>Last sync {lastSyncLabel} UTC</span>
      </div>
    </header>

    <section data-offline-banner data-state={connection} class={cn(
      "grid gap-3 rounded-md border p-4 md:grid-cols-[minmax(0,1fr)_auto]",
      connection === "online" && "border-success/30 bg-success/10",
      connection === "syncing" && "border-warning/35 bg-warning/10",
      connection === "offline" && "border-destructive/30 bg-destructive/10",
    )}>
      <div class={cn("min-w-0")}>
        <div class={cn("flex flex-wrap items-center gap-2")}>
          <span aria-hidden="true" class={cn("h-2.5 w-2.5 rounded-full", connection === "online" ? "bg-success" : connection === "syncing" ? "bg-warning" : "bg-destructive")}></span>
          <h2 class={cn("text-base font-semibold")}>
            {#if connection === "online"}
              Connection restored
            {:else if connection === "syncing"}
              Syncing queued work
            {:else}
              You're offline
            {/if}
          </h2>
        </div>
        <p data-offline-message class={cn("mt-2 max-w-3xl text-sm text-muted-foreground")}>
          {#if connection === "online"}
            All queued changes synced. Continue working with current data.
          {:else if connection === "syncing"}
            Replaying queued mutations and refreshing safe reads.
          {:else}
            {queuedChanges} changes are queued locally. Last successful sync was {lastSyncLabel} UTC.
          {/if}
        </p>
      </div>
      <div class={cn("flex flex-wrap items-center gap-2 md:justify-end")}>
        <button data-sync-now type="button" onclick={syncNow} disabled={connection === "syncing"} class={cn(
          "h-10 rounded-md px-3 text-sm font-medium",
          connection === "syncing" ? "cursor-wait border border-input bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}>
          {connection === "syncing" ? "Syncing..." : "Sync now"}
        </button>
        <button data-simulate-offline type="button" onclick={simulateOffline} class={cn("h-10 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted")}>
          Simulate offline
        </button>
      </div>
    </section>

    <section class={cn("grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]")}>
      <div data-queue-panel class={cn("rounded-md border border-border bg-card p-4")}>
        <div class={cn("flex flex-wrap items-center justify-between gap-2")}>
          <h2 class={cn("text-sm font-semibold")}>Queued changes</h2>
          <span data-queued-count class={cn("rounded-full bg-muted px-2 py-1 text-xs font-medium")}>{queuedChanges} pending</span>
        </div>
        <div class={cn("mt-3 divide-y divide-border")}>
          {#each [
            ["task.update", "FUL-127 status changed"],
            ["comment.create", "Review note saved"],
            ["view.save", "Filtered view updated"],
          ].slice(0, queuedChanges) as item}
            <div data-queued-change class={cn("grid gap-1 py-2 text-sm sm:grid-cols-[140px_1fr]")}>
              <code class={cn("text-xs text-muted-foreground")}>{item[0]}</code>
              <span>{item[1]}</span>
            </div>
          {:else}
            <p data-empty-queue class={cn("py-4 text-sm text-muted-foreground")}>No queued changes.</p>
          {/each}
        </div>
      </div>

      <aside data-reconnect-contract class={cn("rounded-md border border-border bg-background p-4")}>
        <h2 class={cn("text-sm font-semibold")}>Reconnect contract</h2>
        <dl class={cn("mt-3 space-y-3 text-sm")}>
          <div>
            <dt class={cn("text-xs font-medium uppercase text-muted-foreground")}>Safe reads</dt>
            <dd>Refresh after connectivity returns.</dd>
          </div>
          <div>
            <dt class={cn("text-xs font-medium uppercase text-muted-foreground")}>Mutations</dt>
            <dd>Replay in order with trace-linked audit rows.</dd>
          </div>
          <div>
            <dt class={cn("text-xs font-medium uppercase text-muted-foreground")}>Conflict handling</dt>
            <dd>Stop replay and surface resolution when server data changed.</dd>
          </div>
        </dl>
      </aside>
    </section>

    <section data-pwa-install-fixture class={cn("rounded-md border border-border bg-card p-4")}>
      <h2 class={cn("text-lg font-semibold")}>Install Fulcrum on this device</h2>
      <p class={cn("mt-1 text-sm text-muted-foreground")}>
        Listens to the browser's <code class={cn("font-mono")}>beforeinstallprompt</code> event and surfaces a manifest-backed prompt once the user opts in.
      </p>

      {#if pwaPromptState === "available"}
        <div
          data-pwa-install-prompt
          role="dialog"
          aria-labelledby="pwa-install-title"
          class={cn("mt-3 flex items-center gap-3 rounded-md border border-primary/40 bg-primary/5 p-3")}
        >
          <span
            data-pwa-app-icon
            aria-hidden="true"
            class={cn("flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground")}
          >F</span>
          <div class={cn("flex-1")}>
            <p id="pwa-install-title" data-pwa-app-name class={cn("font-medium")}>Fulcrum</p>
            <p class={cn("text-xs text-muted-foreground")}>Open Fulcrum from your home screen and keep working while offline.</p>
          </div>
          <div class={cn("flex gap-2")}>
            <button
              type="button"
              data-pwa-install-accept
              class={cn("h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground")}
              onclick={acceptInstall}
            >Install</button>
            <button
              type="button"
              data-pwa-install-dismiss
              class={cn("h-9 rounded-md border border-border px-3 text-sm")}
              onclick={dismissInstall}
            >Not now</button>
          </div>
        </div>
      {:else if pwaPromptState === "accepted"}
        <p data-pwa-install-accepted class={cn("mt-3 text-sm text-success")}>
          Install accepted. Tracked {pwaInstallCount} install(s) this session.
        </p>
      {:else if pwaPromptState === "dismissed"}
        <p data-pwa-install-dismissed class={cn("mt-3 text-sm text-muted-foreground")}>
          Prompt dismissed. We will not re-ask until the next install event.
        </p>
      {/if}

      <button
        type="button"
        data-pwa-install-reset
        class={cn("mt-3 inline-flex h-8 rounded-md border border-border px-2 text-xs")}
        onclick={resetInstall}
      >Replay prompt</button>
    </section>
  </div>
</main>
