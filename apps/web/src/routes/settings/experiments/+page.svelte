<script lang="ts">
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();
  const experiments = $derived(data.experiments ?? []);

  let showCreate = $state(false);
  let nameInput = $state("");
  let descInput = $state("");
  let variantsInput = $state("control,treatment");
  let rolloutPercent = $state(100);

  /** Selected experiment id for metrics view */
  let selectedId = $state<string | null>(null);
  const selectedExp = $derived(experiments.find((e: { id: string }) => e.id === selectedId) ?? null);
</script>

<svelte:head>
  <title>Experiments | Fulcrum Settings</title>
</svelte:head>

<div data-settings-experiments class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
  <header class="flex items-center justify-between">
    <div class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">A/B Experiments</h1>
      <p class="text-sm text-muted-foreground">Create and monitor experiments with variant assignment and conversion metrics.</p>
    </div>
    <button
      data-create-experiment-btn
      onclick={() => { showCreate = !showCreate; }}
      class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    >
      {showCreate ? "Cancel" : "New Experiment"}
    </button>
  </header>

  {#if form?.createError}
    <p data-create-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.createError}
    </p>
  {/if}

  {#if showCreate}
    <section data-create-dialog class="rounded-md border border-border p-4 flex flex-col gap-4">
      <h2 class="text-lg font-medium">Create Experiment</h2>
      <form method="POST" action="?/create" class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-sm">
          Name
          <input
            data-name-input
            name="name"
            bind:value={nameInput}
            required
            placeholder="button-color"
            class="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label class="flex flex-col gap-1 text-sm">
          Description
          <input
            name="description"
            bind:value={descInput}
            placeholder="Optional description"
            class="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label class="flex flex-col gap-1 text-sm">
          Variants (comma-separated, min 2)
          <input
            data-variants-input
            name="variants"
            bind:value={variantsInput}
            required
            placeholder="control,treatment"
            class="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label class="flex flex-col gap-1 text-sm">
          Rollout % ({rolloutPercent}%)
          <input
            data-rollout-slider
            type="range"
            name="rolloutPercent"
            min="0"
            max="100"
            bind:value={rolloutPercent}
            class="w-full accent-primary"
          />
        </label>

        <div class="flex gap-2">
          <button
            data-create-submit
            type="submit"
            class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create
          </button>
          <button
            type="button"
            onclick={() => { showCreate = false; }}
            class="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  {/if}

  <!-- Experiment list -->
  {#if experiments.length === 0}
    <p data-empty-state class="text-sm text-muted-foreground">No experiments yet. Create one above.</p>
  {:else}
    <section aria-label="Experiments list" class="overflow-x-auto rounded-md border border-border">
      <table data-experiments-table class="w-full min-w-[680px] text-sm">
        <thead class="border-b border-border bg-muted/50">
          <tr>
            <th class="px-4 py-2 text-left font-medium">Name</th>
            <th class="px-4 py-2 text-left font-medium">Variants</th>
            <th class="w-[100px] px-4 py-2 text-left font-medium">Rollout</th>
            <th class="w-[120px] px-4 py-2 text-left font-medium">Metrics</th>
          </tr>
        </thead>
        <tbody>
          {#each experiments as exp (exp.id)}
            <tr class="border-b border-border last:border-0 hover:bg-muted/30">
              <td class="px-4 py-3 align-top font-medium">{exp.name}</td>
              <td class="px-4 py-3 align-top">
                <div class="flex flex-wrap gap-1">
                  {#each exp.variants as variant}
                    <span data-variant-badge class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{variant}</span>
                  {/each}
                </div>
              </td>
              <td class="px-4 py-3 align-top">{exp.rolloutPercent}%</td>
              <td class="px-4 py-3 align-top">
                <button
                  data-view-metrics-btn={exp.id}
                  onclick={() => { selectedId = selectedId === exp.id ? null : exp.id; }}
                  class="text-xs text-primary underline hover:no-underline"
                >
                  {selectedId === exp.id ? "Hide" : "View"}
                </button>
              </td>
            </tr>
            {#if selectedId === exp.id && selectedExp}
              <tr>
                <td colspan="4" class="bg-muted/20 px-4 py-4">
                  <div data-metrics-pane class="flex flex-col gap-2">
                    <h3 class="text-sm font-semibold">Metrics: {selectedExp.name}</h3>
                    <p class="text-xs text-muted-foreground">Variants, assignment counts, and conversion metrics use recorded experiment events.</p>
                    <div class="flex gap-4">
                      {#each selectedExp.variants as variant}
                        <div data-variant-metric-bar class="flex flex-col items-center gap-1">
                          <div class="h-16 w-10 rounded bg-primary/30 flex items-end">
                            <div class="w-full rounded bg-primary" style="height: 30%"></div>
                          </div>
                          <span class="text-xs">{variant}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>
