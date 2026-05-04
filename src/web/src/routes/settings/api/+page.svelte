<script lang="ts">
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let copied = $state(false);

  async function copyApiKey() {
    try {
      await navigator.clipboard.writeText(data.baseUrl);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch {
      // ignore clipboard errors
    }
  }
</script>

<svelte:head>
  <title>API Settings — Fulcrum</title>
</svelte:head>

<section data-settings-api class="flex flex-col gap-6">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">API</h1>
    <p class="text-sm text-muted-foreground">Access the Fulcrum REST API and manage API keys.</p>
  </header>

  <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
    <h2 class="text-sm font-medium">Base URL</h2>
    <div class="flex items-center gap-2">
      <code data-api-base-url class="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono">{data.baseUrl}</code>
      <button
        type="button"
        data-copy-api-key
        onclick={copyApiKey}
        class="h-8 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs"
      >{copied ? "Copied!" : "Copy API Key"}</button>
    </div>
    <p class="text-xs text-muted-foreground">
      View the <a href="/api/v1/openapi.json" target="_blank" class="underline">OpenAPI spec</a> for endpoint documentation.
    </p>
  </div>

  <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
    <h2 class="text-sm font-medium">API Keys</h2>
    {#if data.apiKeys.length === 0}
      <p data-api-keys-empty class="text-sm text-muted-foreground">No API keys created yet.</p>
    {:else}
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border text-left text-xs text-muted-foreground">
            <th class="pb-2 font-medium">Name</th>
            <th class="pb-2 font-medium">Prefix</th>
            <th class="pb-2 font-medium">Created</th>
            <th class="pb-2 font-medium">Last used</th>
          </tr>
        </thead>
        <tbody>
          {#each data.apiKeys as key (key.id)}
            <tr class="border-b border-border/50 py-2">
              <td class="py-2">{key.name}</td>
              <td class="py-2 font-mono">{key.prefix}…</td>
              <td class="py-2">{key.createdAt}</td>
              <td class="py-2">{key.lastUsedAt ?? "Never"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</section>
