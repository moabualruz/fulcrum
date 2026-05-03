<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { browser } from "$app/environment";
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";
  import { buttonVariants } from "$lib/components/ui/button";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // 5s poll
  $effect(() => {
    if (!browser) return;
    const handle = setInterval(() => {
      void invalidateAll();
    }, 5000);
    return () => clearInterval(handle);
  });

  // Model pull progress state
  let pullProgress = $state<Record<string, number>>({});
  let pullActive = $state<Record<string, boolean>>({});

  // Backend config form state
  let selectedBackend = $state("embedded");
  let backendHost = $state("");
  let backendApiUrl = $state("");
  let backendApiKey = $state("");

  function statusColor(running: boolean): string {
    return running ? "bg-green-500" : "bg-red-500";
  }

  function statusLabel(running: boolean): string {
    return running ? "Running" : "Stopped";
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  async function handlePull(modelId: string) {
    pullActive[modelId] = true;
    pullProgress[modelId] = 0;
    try {
      const res = await fetch(
        `/api/inference/models/${encodeURIComponent(modelId)}/pull`,
        { method: "POST" },
      );
      if (!res.ok || !res.body) throw new Error("Pull failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (line.startsWith("data:")) {
            try {
              const evt = JSON.parse(line.slice(5));
              if (typeof evt.progress === "number") pullProgress[modelId] = evt.progress;
            } catch { /* skip */ }
          }
        }
      }
      pullProgress[modelId] = 100;
    } catch {
      pullProgress[modelId] = -1;
    } finally {
      pullActive[modelId] = false;
    }
  }
</script>

<header
  data-inference-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Inference</h1>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="detail" />
{:then payload}
  <!-- Status card + start/stop -->
  <section data-inference-status class={cn("mb-6 flex items-center gap-4")}>
    <div class={cn("flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3")}>
      <span
        data-status-dot
        class={cn("inline-block h-3 w-3 rounded-full", statusColor(payload.running))}
      ></span>
      <span
        data-sidecar-status={payload.running ? "running" : "stopped"}
        class={cn("font-medium")}
      >{statusLabel(payload.running)}</span>
    </div>

    {#if !payload.running}
      <form method="POST" action="?/start" use:enhance>
        <button
          type="submit"
          data-start-button
          class={cn(buttonVariants({ variant: "default" }))}
        >Start sidecar</button>
      </form>
    {:else}
      <form method="POST" action="?/stop" use:enhance>
        <button
          type="submit"
          data-stop-button
          class={cn(buttonVariants({ variant: "destructive" }))}
        >Stop sidecar</button>
      </form>
    {/if}

    {#if payload.error}
      <span class={cn("text-sm text-destructive")}>{payload.error}</span>
    {/if}
  </section>

  <!-- Model list -->
  <section data-inference-models class={cn("mb-6")}>
    <h2 class={cn("text-lg font-semibold mb-3")}>Models</h2>
    {#if payload.models.length === 0}
      <div class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>
        No models available. Start the sidecar to list models.
      </div>
    {:else}
      <div class={cn("space-y-2")}>
        {#each payload.models as model (model.id)}
          <div
            data-model-row={model.id}
            class={cn("flex items-center justify-between rounded-lg border border-border p-3")}
          >
            <div>
              <span class={cn("font-medium")}>{model.name}</span>
              <span class={cn("ml-2 text-xs text-muted-foreground")}>{formatBytes(model.size_bytes)}</span>
              <span class={cn("ml-2 text-xs")}>
                {#if model.downloaded}
                  <span data-model-downloaded class={cn("text-green-600")}>Downloaded</span>
                {:else}
                  <span class={cn("text-muted-foreground")}>Not downloaded</span>
                {/if}
              </span>
              <span class={cn("ml-2 text-xs text-muted-foreground")}>{model.capabilities.join(", ")}</span>
            </div>
            <div class={cn("flex items-center gap-2")}>
              {#if pullActive[model.id]}
                <div data-pull-progress class={cn("relative w-32 h-2 bg-muted rounded overflow-hidden")}>
                  <div
                    class={cn("absolute inset-y-0 left-0 bg-primary rounded transition-all")}
                    style="width: {Math.max(0, pullProgress[model.id] ?? 0)}%"
                  ></div>
                </div>
                <span class={cn("text-xs text-muted-foreground")}>{pullProgress[model.id] ?? 0}%</span>
              {:else if !model.downloaded}
                <button
                  data-pull-button={model.id}
                  type="button"
                  onclick={() => handlePull(model.id)}
                  class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >Pull</button>
              {/if}
              {#if model.downloaded}
                <button
                  data-set-default-button={model.id}
                  type="button"
                  class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  onclick={async () => {
                    await fetch(`/api/inference/models/${encodeURIComponent(model.id)}/set-default`, { method: "POST" });
                    await invalidateAll();
                  }}
                >Set default</button>
                <button
                  data-remove-button={model.id}
                  type="button"
                  onclick={async () => {
                    await fetch(`/api/inference/models/${encodeURIComponent(model.id)}`, { method: "DELETE" });
                    await invalidateAll();
                  }}
                  class={cn(buttonVariants({ variant: "destructive", size: "sm" }))}
                >Remove</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Backend config -->
  <section data-inference-backend-config class={cn("mb-6")}>
    <h2 class={cn("text-lg font-semibold mb-3")}>Backend configuration</h2>
    <form method="POST" action="?/setBackend" use:enhance class={cn("space-y-4 max-w-lg")}>
      <div>
        <label class={cn("block text-sm font-medium mb-1")} for="backend-select">Backend</label>
        <select
          id="backend-select"
          name="backend"
          data-backend-select
          bind:value={selectedBackend}
          class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
        >
          <option value="embedded">Embedded (default)</option>
          <option value="ollama">Ollama</option>
          <option value="lm-studio">LM Studio</option>
          <option value="openai-compatible">OpenAI-compatible</option>
        </select>
      </div>

      {#if selectedBackend === "ollama" || selectedBackend === "lm-studio"}
        <div data-host-field>
          <label class={cn("block text-sm font-medium mb-1")} for="backend-host">Host</label>
          <input
            id="backend-host"
            name="host"
            type="text"
            bind:value={backendHost}
            placeholder={selectedBackend === "ollama" ? "http://localhost:11434" : "http://localhost:1234"}
            class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
          />
        </div>
      {/if}

      {#if selectedBackend === "openai-compatible"}
        <div data-api-url-field>
          <label class={cn("block text-sm font-medium mb-1")} for="backend-api-url">API URL</label>
          <input
            id="backend-api-url"
            name="api_url"
            type="text"
            bind:value={backendApiUrl}
            placeholder="https://api.openai.com/v1"
            class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
          />
        </div>
        <div data-api-key-field>
          <label class={cn("block text-sm font-medium mb-1")} for="backend-api-key">API Key</label>
          <input
            id="backend-api-key"
            name="api_key"
            type="password"
            bind:value={backendApiKey}
            placeholder="sk-..."
            class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
          />
        </div>
      {/if}

      <button
        type="submit"
        data-save-backend
        class={cn(buttonVariants({ variant: "default" }))}
      >Save</button>
    </form>
  </section>
{/await}
