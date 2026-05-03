<script lang="ts">
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();
  const errorLogs = $derived(data.errorLogs ?? []);

  function formatOccurred(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
</script>

<svelte:head>
  <title>Errors | Fulcrum Settings</title>
</svelte:head>

<div data-settings-errors class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
  <header class="flex flex-col gap-1">
    <h1 class="text-2xl font-semibold tracking-tight">Errors</h1>
    <p class="text-sm text-muted-foreground">Local crashlog entries mirrored from the Fulcrum runtime.</p>
  </header>

  {#if form?.clearError}
    <p data-clear-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.clearError}
    </p>
  {:else if form?.ok}
    <p data-clear-result class="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
      Cleared {form.deleted} error logs.
    </p>
  {/if}

  <form method="POST" action="?/clear" class="flex flex-wrap items-end gap-3">
    <label class="grid gap-1 text-sm">
      <span class="font-medium">Clear before</span>
      <input
        class="h-9 rounded-md border border-input bg-background px-3 text-sm"
        name="before"
        type="datetime-local"
      />
    </label>
    <button class="h-9 rounded-md border border-border px-3 text-sm font-medium" type="submit">Clear</button>
  </form>

  <section aria-label="Local error logs" class="flex flex-col gap-3">
    {#if errorLogs.length === 0}
      <p class="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">No error logs recorded.</p>
    {:else}
      {#each errorLogs as item (item.id)}
        <article class="rounded-md border border-border p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="grid gap-1">
              <h2 class="text-base font-semibold">{item.errorMessage}</h2>
              <p class="text-xs text-muted-foreground">{formatOccurred(item.occurredAt)}</p>
            </div>
            <code class="rounded bg-muted px-2 py-1 text-xs">{item.id}</code>
          </div>

          <dl class="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt class="font-medium">Command</dt>
              <dd class="break-words text-muted-foreground">{item.recentCliCommand ?? "unknown"}</dd>
            </div>
            <div>
              <dt class="font-medium">Procedure</dt>
              <dd class="break-words text-muted-foreground">{item.recentTrpcProcedure ?? "unknown"}</dd>
            </div>
            <div>
              <dt class="font-medium">Runtime</dt>
              <dd class="text-muted-foreground">{item.os ?? "unknown"} / {item.arch ?? "unknown"} / Bun {item.bunVersion ?? "unknown"}</dd>
            </div>
            <div>
              <dt class="font-medium">Fulcrum</dt>
              <dd class="text-muted-foreground">{item.fulcrumVersion ?? "unknown"}</dd>
            </div>
          </dl>

          {#if item.stackTrace}
            <pre data-error-stack class="mt-4 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{item.stackTrace}</pre>
          {/if}
        </article>
      {/each}
    {/if}
  </section>
</div>
