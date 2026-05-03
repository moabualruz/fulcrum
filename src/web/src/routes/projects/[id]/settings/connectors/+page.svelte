<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}>
  <div class={cn("flex items-baseline gap-3")}>
    <a href="/projects/{data.projectId}" class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Connectors</h1>
  </div>
</header>

<form method="POST" action="?/upsert" use:enhance data-upsert-connector-form class={cn("flex flex-col gap-3 max-w-xl mb-8")}>
  <div class={cn("flex flex-col gap-1.5")}>
    <label for="connector-type" class={cn("text-sm font-medium")}>Connector Type</label>
    <input id="connector-type" name="connectorType" type="text" required placeholder="jira" class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm")} />
  </div>
  <div class={cn("flex flex-col gap-1.5")}>
    <label for="connector-config" class={cn("text-sm font-medium")}>Configuration (JSON)</label>
    <textarea id="connector-config" name="config" rows="3" placeholder='{"host": "jira.example.com", "email": "...", "token": "..."}' class={cn("border-input bg-background min-h-16 rounded-md border px-3 py-2 text-sm")}></textarea>
  </div>
  <div class={cn("flex items-center gap-2")}>
    <input id="connector-enabled" name="enabled" type="checkbox" />
    <label for="connector-enabled" class={cn("text-sm")}>Enable connector</label>
  </div>
  <button type="submit" data-upsert-connector-submit class={cn("bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium shadow-xs w-fit")}>Save Connector</button>
</form>

{#if data.connectors.length === 0}
  <p data-empty-connectors class={cn("text-muted-foreground text-sm")}>No connectors configured.</p>
{:else}
  <div data-connectors-list class={cn("grid gap-4 max-w-xl")}>
    {#each data.connectors as connector (connector.id)}
      <div data-connector-card class={cn("rounded-lg border border-border p-4")}>
        <div class={cn("flex items-center justify-between mb-2")}>
          <h3 class={cn("text-sm font-semibold")}>{connector.connector_type}</h3>
          <span class={cn("text-xs px-2 py-0.5 rounded-full", connector.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600")}>
            {connector.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        {#if connector.last_synced_at}
          <p class={cn("text-xs text-muted-foreground")}>Last synced: {connector.last_synced_at}</p>
        {/if}
        {#if connector.enabled}
          <form method="POST" action="?/sync" use:enhance class={cn("mt-2")}>
            <input type="hidden" name="id" value={connector.id} />
            <button type="submit" data-sync-connector class={cn("text-xs text-primary hover:underline")}>Sync Now</button>
          </form>
        {:else}
          <p class={cn("mt-2 text-xs text-muted-foreground")}>Enable via feature flags to configure.</p>
        {/if}
      </div>
    {/each}
  </div>
{/if}
