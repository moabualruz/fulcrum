<script lang="ts">
  import type { ActionData, PageData } from "./$types";
  import type { ImporterName } from "./+page.server.js";
  import { CredentialInput } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();

  let selectedTab = $state<ImporterName | null>(null);
  let preflightDone = $state(false);
  let preflightRowCount = $state(0);
  let preflightColumns = $state<string[]>([]);
  let activeImporter = $state<ImporterName | null>(null);

  $effect(() => {
    if (form && "preflightOk" in form && form.preflightOk) {
      preflightDone = true;
      preflightRowCount = (form as { rowCount?: number }).rowCount ?? 0;
      preflightColumns = (form as { columns?: string[] }).columns ?? [];
      activeImporter = (form as { importerName?: ImporterName }).importerName ?? null;
    }
    if (form && "importOk" in form && form.importOk) {
      preflightDone = false;
      activeImporter = null;
    }
  });

  const enabledImporters = $derived(data.importers.filter((i) => i.enabled));

  function tabLabel(name: ImporterName): string {
    const labels: Record<ImporterName, string> = {
      csv: "CSV",
      linear: "Linear",
      jira: "Jira",
      plane: "Plane",
    };
    return labels[name];
  }
</script>

<svelte:head>
  <title>Importers | Fulcrum</title>
</svelte:head>

<section data-settings-importers class="flex flex-col gap-6">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Import</h1>
    <p class="text-sm text-muted-foreground">Import tasks from external sources.</p>
  </header>

  {#if enabledImporters.length === 0}
    <div data-importers-empty class="rounded-lg border border-border bg-card p-6 text-center">
      <p class="text-sm text-muted-foreground">No importers are enabled. Set <code class="font-mono text-xs">FULCRUM_FEATURES=import-csv</code> (or <code class="font-mono text-xs">import-linear</code>, <code class="font-mono text-xs">import-jira</code>, <code class="font-mono text-xs">import-plane</code>) to enable importers.</p>
    </div>
  {:else}
    <!-- Tab bar -->
    <div class="flex gap-1 border-b border-border" data-importer-tabs>
      {#each enabledImporters as importer (importer.name)}
        <button
          type="button"
          data-importer-tab={importer.name}
          onclick={() => { selectedTab = importer.name; preflightDone = false; }}
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {selectedTab === importer.name
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'}"
        >{tabLabel(importer.name)}</button>
      {/each}
    </div>

    {#if selectedTab}
      {@const preflightError = form && "preflightError" in form && (form as { importerName?: ImporterName }).importerName === selectedTab
        ? (form as { preflightError?: string }).preflightError
        : null}
      {@const importOkForTab = form && "importOk" in form && (form as { importerName?: ImporterName }).importerName === selectedTab}

      <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-4" data-importer-panel={selectedTab}>
        <h2 class="text-sm font-medium">{tabLabel(selectedTab)} Import Wizard</h2>

        {#if preflightError}
          <p data-importer-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{preflightError}</p>
        {/if}

        {#if importOkForTab}
          <p data-import-success class="rounded-md border border-green-700/30 bg-green-950/20 px-3 py-2 text-sm text-green-700">
            Import complete: {(form as { rowCount?: number }).rowCount ?? 0} tasks imported.
          </p>
        {/if}

        {#if !preflightDone || activeImporter !== selectedTab}
          <!-- Step 1: Upload / connect -->
          <form method="POST" action="?/preflight" enctype="multipart/form-data" class="flex flex-col gap-3">
            <input type="hidden" name="importerName" value={selectedTab} />

            {#if selectedTab === "csv"}
              <div class="flex flex-col gap-1.5">
                <label for="csv-file" class="text-sm font-medium">CSV file</label>
                <input
                  id="csv-file"
                  name="file"
                  type="file"
                  accept=".csv"
                  data-csv-file-input
                  class="text-sm"
                />
              </div>
            {:else}
              <div class="flex flex-col gap-1.5">
                <label for="api-key-{selectedTab}" class="text-sm font-medium">{tabLabel(selectedTab)} API Key</label>
                <CredentialInput
                  id="api-key-{selectedTab}"
                  name="apiKey"
                  placeholder="Enter API key"
                  data-api-key-input
                />
              </div>
            {/if}

            <button
              type="submit"
              data-preflight-btn
              class="h-9 w-fit rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs"
            >Preflight check</button>
          </form>
        {:else}
          <!-- Step 2: Dry-run summary + confirm -->
          <div data-preflight-summary class="rounded-md border border-border bg-muted/30 px-4 py-3 flex flex-col gap-2">
            <p class="text-sm font-medium">Preflight summary</p>
            <p class="text-sm text-muted-foreground" data-preflight-row-count>
              {preflightRowCount} rows detected
            </p>
            {#if preflightColumns.length > 0}
              <p class="text-xs text-muted-foreground">Columns: {preflightColumns.join(", ")}</p>
            {/if}
          </div>

          <div class="flex gap-2">
            <form method="POST" action="?/import" class="flex gap-2">
              <input type="hidden" name="importerName" value={selectedTab} />
              <input type="hidden" name="rowCount" value={preflightRowCount} />
              <button
                type="submit"
                data-confirm-import-btn
                class="h-9 w-fit rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs"
              >Confirm import</button>
            </form>
            <button
              type="button"
              onclick={() => { preflightDone = false; activeImporter = null; }}
              class="h-9 w-fit rounded-md border border-border bg-background px-4 text-sm font-medium shadow-xs"
            >Cancel</button>
          </div>
        {/if}
      </div>
    {:else}
      <p class="text-sm text-muted-foreground">Select a tab above to begin importing.</p>
    {/if}
  {/if}

  <!-- Import history -->
  <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
    <h2 class="text-sm font-medium">Import history</h2>
    {#if data.importHistory.length === 0}
      <p data-import-history-empty class="text-sm text-muted-foreground">No imports yet.</p>
    {:else}
      <table class="w-full text-sm" data-import-history>
        <thead>
          <tr class="border-b border-border text-left text-xs text-muted-foreground">
            <th class="pb-2 font-medium">Source</th>
            <th class="pb-2 font-medium">Rows</th>
            <th class="pb-2 font-medium">Status</th>
            <th class="pb-2 font-medium">Imported at</th>
          </tr>
        </thead>
        <tbody>
          {#each data.importHistory as entry (entry.id)}
            <tr class="border-b border-border/50" data-import-entry={entry.id}>
              <td class="py-2">{entry.importerName}</td>
              <td class="py-2">{entry.rowCount}</td>
              <td class="py-2">{entry.status}</td>
              <td class="py-2">{entry.importedAt}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</section>
