<script lang="ts">
  import type { ActionData, PageData } from "./$types";
  import type { ConnectorName } from "./+page.server.js";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();
</script>

<svelte:head>
  <title>Connectors | Fulcrum</title>
</svelte:head>

<section data-settings-connectors class="flex flex-col gap-6">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Connectors</h1>
    <p class="text-sm text-muted-foreground">Connect Fulcrum to external knowledge sources.</p>
  </header>

  {#if data.loadError}
    <p data-connector-route-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {data.loadError}
    </p>
  {/if}

  <div class="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
    {#each data.connectors as connector (connector.name)}
      {@const label = connector.name === "confluence" ? "Confluence"
        : connector.name === "notion" ? "Notion"
        : "GitHub Issues"}
      {@const isSaveOk = form && "saveOk" in form && form.saveOk && (form as { name?: ConnectorName }).name === connector.name}
      {@const isSyncOk = form && "syncOk" in form && form.syncOk && (form as { name?: ConnectorName }).name === connector.name}
      {@const saveError = form && "saveError" in form && (form as { name?: ConnectorName }).name === connector.name
        ? (form as { saveError?: string }).saveError
        : null}

      <div
        data-connector={connector.name}
        class="rounded-lg border border-border bg-card p-4 flex flex-col gap-4 {connector.enabled ? '' : 'opacity-60'}"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-medium">{label}</h2>
          {#if !connector.enabled}
            <span
              data-connector-disabled={connector.name}
              class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >Enable via feature flags</span>
          {:else}
            <span class="rounded-full bg-green-700/20 px-2 py-0.5 text-xs text-green-700">Enabled</span>
          {/if}
        </div>

        {#if connector.enabled}
          {#if saveError}
            <p data-connector-save-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{saveError}</p>
          {/if}
          {#if isSaveOk}
            <p data-connector-save-ok class="rounded-md border border-green-700/30 bg-green-950/20 px-3 py-2 text-sm text-green-700">Configuration saved.</p>
          {/if}
          {#if isSyncOk}
            <p data-connector-sync-ok class="rounded-md border border-green-700/30 bg-green-950/20 px-3 py-2 text-sm text-green-700">Sync started.</p>
          {/if}

          <form method="POST" action="?/save" class="flex flex-col gap-3">
            <input type="hidden" name="name" value={connector.name} />
            <div class="flex flex-col gap-1.5">
              <label for="host-{connector.name}" class="text-sm font-medium">Host / Base URL</label>
              <input
                id="host-{connector.name}"
                name="host"
                type="text"
                placeholder="https://yourorg.atlassian.net"
                value={connector.config?.host ?? ""}
                class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="email-{connector.name}" class="text-sm font-medium">Email</label>
              <input
                id="email-{connector.name}"
                name="email"
                type="email"
                placeholder="user@example.com"
                value={connector.config?.email ?? ""}
                class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="token-{connector.name}" class="text-sm font-medium">API Token</label>
              <input
                id="token-{connector.name}"
                name="token"
                type="password"
                placeholder="••••••••"
                value={connector.config?.token ?? ""}
                class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
              />
            </div>
            <button
              type="submit"
              data-connector-save={connector.name}
              class="h-9 w-fit rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs"
            >Save</button>
          </form>

          <form method="POST" action="?/sync">
            <input type="hidden" name="name" value={connector.name} />
            <button
              type="submit"
              data-connector-sync={connector.name}
              class="h-9 w-fit rounded-md border border-border bg-background px-4 text-sm font-medium shadow-xs"
            >Sync now</button>
          </form>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Sync log -->
  <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
    <h2 class="text-sm font-medium">Sync log</h2>
    {#if data.syncLog.length === 0}
      <p data-sync-log-empty class="text-sm text-muted-foreground">No syncs yet.</p>
    {:else}
      <table class="w-full text-sm" data-sync-log>
        <thead>
          <tr class="border-b border-border text-left text-xs text-muted-foreground">
            <th class="pb-2 font-medium">Connector</th>
            <th class="pb-2 font-medium">Status</th>
            <th class="pb-2 font-medium">Message</th>
            <th class="pb-2 font-medium">Started at</th>
          </tr>
        </thead>
        <tbody>
          {#each data.syncLog as entry (entry.id)}
            <tr class="border-b border-border/50" data-sync-entry={entry.id}>
              <td class="py-2">{entry.connectorName}</td>
              <td class="py-2">{entry.status}</td>
              <td class="py-2">{entry.message}</td>
              <td class="py-2">{entry.startedAt}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</section>
