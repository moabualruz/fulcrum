<script lang="ts">
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();
  const status = $derived(data.status);
  const stateLabel = $derived(status.opted_in ? "Enabled" : "Disabled");
  const eventLabel = $derived(`${status.row_count} ${status.row_count === 1 ? "event" : "events"} stored locally`);
  const telemetryError = $derived(
    form && "telemetryError" in form && typeof form.telemetryError === "string"
      ? form.telemetryError
      : null,
  );
</script>

<svelte:head>
  <title>Telemetry | Fulcrum Settings</title>
</svelte:head>

<div data-telemetry-settings class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
  <header class="flex flex-col gap-1">
    <h1 class="text-2xl font-semibold tracking-tight">Telemetry</h1>
    <p class="text-sm text-muted-foreground">Manage local aggregate telemetry collection.</p>
  </header>

  {#if telemetryError}
    <p data-telemetry-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {telemetryError}
    </p>
  {/if}

  <section aria-label="Telemetry status" class="rounded-md border border-border">
    <div class="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium">Local collection</span>
        <span class="text-2xl font-semibold">{stateLabel}</span>
        <span class="text-sm text-muted-foreground">{eventLabel}</span>
      </div>

      <div class="flex flex-wrap gap-2">
        {#if status.opted_in}
          <form method="POST" action="?/optOut">
            <button type="submit" class="rounded-md border border-border px-3 py-2 text-sm font-medium">Disable</button>
          </form>
        {:else}
          <form method="POST" action="?/optIn">
            <button type="submit" class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Enable</button>
          </form>
        {/if}

        <form method="POST" action="?/purge">
          <button type="submit" class="rounded-md border border-border px-3 py-2 text-sm font-medium">Purge</button>
        </form>
      </div>
    </div>
  </section>
</div>
