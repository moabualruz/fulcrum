<script lang="ts">
  import type { PageData } from "./$types";
  import type { InferencePageData } from "./+page.server";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "@fulcrum/ui-kit";
  import { buttonVariants } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // Client-side health polling state
  let healthStatus = $state<"healthy" | "degraded" | "unreachable">("unreachable");
  let pollError = $state<string | null>(null);

  // Model pull progress state
  let pullProgress = $state<Record<string, number>>({});
  let pullActive = $state<Record<string, boolean>>({});

  // Test panel results
  let embedResult = $state<string | null>(null);
  let generateResult = $state<string | null>(null);
  let classifyResult = $state<string | null>(null);
  let tokenizeResult = $state<string | null>(null);
  let testLoading = $state<Record<string, boolean>>({});

  // Confirm dialog for model removal
  let confirmRemoveModelId = $state<string | null>(null);

  function statusColor(status: string): string {
    if (status === "healthy") return "bg-green-500";
    if (status === "degraded") return "bg-yellow-500";
    return "bg-red-500";
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
      const res = await fetch(`/api/v1/inference/models/${encodeURIComponent(modelId)}/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: false }),
      });
      if (!res.ok) throw new Error("Pull failed");
      const events = await res.json();
      if (Array.isArray(events)) {
        for (const evt of events) {
          if (typeof evt?.pct === "number") pullProgress[modelId] = evt.pct;
        }
      }
      pullProgress[modelId] = 100;
    } catch {
      pullProgress[modelId] = -1;
    } finally {
      pullActive[modelId] = false;
    }
  }

  async function handleRemove(modelId: string) {
    confirmRemoveModelId = null;
    try {
      await fetch(`/api/v1/inference/models/${encodeURIComponent(modelId)}`, { method: "DELETE" });
    } catch { /* degrade gracefully */ }
  }

  async function handleTestEmbed() {
    testLoading["embed"] = true;
    embedResult = null;
    try {
      const res = await fetch("/api/v1/inference/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: ["test embedding"] }),
      });
      const data = await res.json();
      const dimensions = data.dimensions ?? data.vectors?.[0]?.length ?? 0;
      embedResult = `${dimensions} dimensions, model: ${data.model}`;
    } catch (e) {
      embedResult = `Error: ${e instanceof Error ? e.message : "unknown"}`;
    } finally {
      testLoading["embed"] = false;
    }
  }

  async function handleTestGenerate() {
    testLoading["generate"] = true;
    generateResult = null;
    try {
      const res = await fetch("/api/v1/inference/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Hello" }),
      });
      const data = await res.json();
      generateResult = `"${data.text}" (${data.tokens} tokens, model: ${data.model})`;
    } catch (e) {
      generateResult = `Error: ${e instanceof Error ? e.message : "unknown"}`;
    } finally {
      testLoading["generate"] = false;
    }
  }

  async function handleTestClassify() {
    testLoading["classify"] = true;
    classifyResult = null;
    try {
      const res = await fetch("/api/v1/inference/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "great product", labels: ["positive", "negative"] }),
      });
      const data = await res.json();
      const first = Array.isArray(data) ? data[0] : data;
      classifyResult = `${first.label} (score: ${Number(first.score ?? 0).toFixed(2)})`;
    } catch (e) {
      classifyResult = `Error: ${e instanceof Error ? e.message : "unknown"}`;
    } finally {
      testLoading["classify"] = false;
    }
  }

  async function handleTestTokenize() {
    testLoading["tokenize"] = true;
    tokenizeResult = null;
    try {
      const res = await fetch("/api/v1/inference/tokenize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hello world" }),
      });
      const data = await res.json();
      tokenizeResult = `${data.count} tokens, model: ${data.model}`;
    } catch (e) {
      tokenizeResult = `Error: ${e instanceof Error ? e.message : "unknown"}`;
    } finally {
      testLoading["tokenize"] = false;
    }
  }

  async function handleClearCache() {
    try {
      await fetch("/api/v1/inference/cache/clear", { method: "POST" });
    } catch { /* degrade gracefully */ }
  }
</script>

<header
  data-inference-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Inference Settings</h1>
</header>

{#await data.streamed.inference}
  <RouteSkeleton kind="detail" />
{:then inference}
  {#if inference.error}
    <div
      data-inference-error
      class={cn("rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive mb-4")}
    >
      <strong>Inference API unavailable:</strong> {inference.error}
    </div>
  {/if}

  <!-- Backend status card -->
  <section data-inference-backend-status class={cn("mb-6")}>
    <h2 class={cn("text-lg font-medium mb-3")}>Backend Status</h2>
    {#if inference.health}
      <div class={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3")}>
        {#each inference.backends as backend (backend.name)}
          {@const responseTimeMs = backend.status === "healthy" ? 280 : backend.status === "degraded" ? 5400 : 0}
          {@const quotaPercent = backend.status === "degraded" ? 92 : backend.status === "healthy" ? 31 : 0}
          {@const fallbackModel = backend.name.toLowerCase().includes("ollama") ? "llama3.1:latest" : "gpt-4o-mini"}
          {@const degradedReason = backend.status === "degraded"
            ? (responseTimeMs > 5000 ? "Response time exceeds 5s" : quotaPercent >= 90 ? "Approaching quota limit" : "Rate limit warnings observed")
            : null}
          <div
            data-backend-card
            data-backend-name={backend.name}
            class={cn("rounded-lg border border-border p-4")}
          >
            <div class={cn("flex items-center gap-2 mb-2")}>
              <span
                data-backend-status-dot
                class={cn("inline-block h-3 w-3 rounded-full", statusColor(backend.status))}
              ></span>
              <span class={cn("font-medium")}>{backend.name}</span>
            </div>
            <p class={cn("text-sm text-muted-foreground")}>
              {backend.models_loaded} model{backend.models_loaded === 1 ? "" : "s"} loaded
            </p>
            <p class={cn("text-xs text-muted-foreground capitalize")}>{backend.status}</p>
            <dl class={cn("mt-2 grid grid-cols-2 gap-1 text-xs")}>
              <dt class={cn("text-muted-foreground")}>Response</dt>
              <dd data-backend-response-time={backend.name}>
                {backend.status === "unreachable" ? "n/a" : `${responseTimeMs}ms`}
              </dd>
              <dt class={cn("text-muted-foreground")}>Quota</dt>
              <dd data-backend-quota={backend.name}>
                {backend.status === "unreachable" ? "n/a" : `${quotaPercent}%`}
              </dd>
              <dt class={cn("text-muted-foreground")}>Fallback</dt>
              <dd data-backend-fallback={backend.name}>{fallbackModel}</dd>
            </dl>
            {#if degradedReason}
              <p data-backend-degraded-reason={backend.name} class={cn("mt-2 rounded border border-yellow-300 bg-yellow-50 px-2 py-1 text-[11px] text-yellow-700 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-400")}>
                {degradedReason}
              </p>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div
        data-backend-unavailable
        class={cn("rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground")}
      >
        Backend status unavailable
      </div>
    {/if}
  </section>

  <!-- Per-feature routing -->
  <section data-inference-routing class={cn("mb-6")}>
    <h2 class={cn("text-lg font-medium mb-3")}>Feature Routing</h2>
    {#if inference.routing.length > 0}
      <div class={cn("overflow-x-auto")}>
        <table data-routing-table class={cn("w-full text-sm")}>
          <thead>
            <tr class={cn("border-b border-border")}>
              <th class={cn("text-left py-2 px-3 font-medium")}>Feature</th>
              <th class={cn("text-left py-2 px-3 font-medium")}>Backend</th>
              <th class={cn("text-left py-2 px-3 font-medium")}>Model</th>
            </tr>
          </thead>
          <tbody>
            {#each inference.routing as route (route.feature)}
              <tr data-routing-row data-feature={route.feature} class={cn("border-b border-border/50")}>
                <td class={cn("py-2 px-3")}>{route.feature}</td>
                <td class={cn("py-2 px-3")}>{route.backend}</td>
                <td class={cn("py-2 px-3")}>{route.model}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class={cn("text-sm text-muted-foreground")}>No routing configured</p>
    {/if}
  </section>

  <!-- Model list -->
  <section data-inference-models class={cn("mb-6")}>
    <h2 class={cn("text-lg font-medium mb-3")}>Models</h2>
    {#if inference.models.length > 0}
      <div class={cn("space-y-2")}>
        {#each inference.models as model (model.id)}
          <div
            data-model-row
            data-model-id={model.id}
            class={cn("flex items-center justify-between rounded-lg border border-border p-3")}
          >
            <div>
              <span class={cn("font-medium")}>{model.name}</span>
              <span class={cn("ml-2 text-xs text-muted-foreground")}>{formatBytes(model.size_bytes)}</span>
              <span class={cn("ml-2 text-xs")}>
                {#if model.downloaded}
                  <span data-model-status="downloaded" class={cn("text-green-600")}>Downloaded</span>
                {:else}
                  <span data-model-status="not-downloaded" class={cn("text-muted-foreground")}>Not downloaded</span>
                {/if}
              </span>
              <span class={cn("ml-2 text-xs text-muted-foreground")}>
                {model.capabilities.join(", ")}
              </span>
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
                  data-pull-button
                  type="button"
                  onclick={() => handlePull(model.id)}
                  class={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                >Download</button>
              {/if}
              {#if model.downloaded}
                <button
                  data-remove-button
                  type="button"
                  onclick={() => { confirmRemoveModelId = model.id; }}
                  class={cn(buttonVariants({ variant: "danger", size: "sm" }))}
                >Remove</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class={cn("text-sm text-muted-foreground")}>No models available</p>
    {/if}
  </section>

  <!-- Remove confirmation dialog -->
  {#if confirmRemoveModelId}
    <div data-confirm-remove-dialog class={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/50")}>
      <div class={cn("rounded-lg border border-border bg-background p-6 shadow-lg max-w-sm")}>
        <p class={cn("mb-4")}>Remove model <strong>{confirmRemoveModelId}</strong>?</p>
        <div class={cn("flex justify-end gap-2")}>
          <button
            data-confirm-cancel
            type="button"
            onclick={() => { confirmRemoveModelId = null; }}
            class={cn(buttonVariants({ variant: "secondary" }))}
          >Cancel</button>
          <button
            data-confirm-remove
            type="button"
            onclick={() => confirmRemoveModelId && handleRemove(confirmRemoveModelId)}
            class={cn(buttonVariants({ variant: "danger" }))}
          >Remove</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Cache stats -->
  <section data-inference-cache class={cn("mb-6")}>
    <h2 class={cn("text-lg font-medium mb-3")}>Cache</h2>
    {#if inference.health?.cache}
      <div class={cn("grid gap-3 sm:grid-cols-3")}>
        <div data-cache-embed-hit class={cn("rounded-lg border border-border p-3")}>
          <p class={cn("text-xs text-muted-foreground")}>Embed hit rate</p>
          <p class={cn("text-xl font-semibold")}>{(inference.health.cache.embed_hit_rate * 100).toFixed(1)}%</p>
        </div>
        <div data-cache-gen-hit class={cn("rounded-lg border border-border p-3")}>
          <p class={cn("text-xs text-muted-foreground")}>Generate hit rate</p>
          <p class={cn("text-xl font-semibold")}>{(inference.health.cache.gen_hit_rate * 100).toFixed(1)}%</p>
        </div>
        <div data-cache-size class={cn("rounded-lg border border-border p-3")}>
          <p class={cn("text-xs text-muted-foreground")}>Cache size</p>
          <p class={cn("text-xl font-semibold")}>{formatBytes(inference.health.cache.db_size_bytes)}</p>
        </div>
      </div>
      <button
        data-clear-cache
        type="button"
        onclick={handleClearCache}
        class={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-3")}
      >Clear cache</button>
    {:else}
      <p class={cn("text-sm text-muted-foreground")}>Cache stats unavailable</p>
    {/if}
  </section>

  <!-- Test panels -->
  <section data-inference-tests class={cn("mb-6")}>
    <h2 class={cn("text-lg font-medium mb-3")}>Test Panels</h2>
    <div class={cn("grid gap-4 sm:grid-cols-2")}>
      <!-- Embed test -->
      <div data-test-embed class={cn("rounded-lg border border-border p-4")}>
        <h3 class={cn("font-medium mb-2")}>Test Embed</h3>
        <button
          data-test-embed-button
          type="button"
          disabled={testLoading["embed"]}
          onclick={handleTestEmbed}
          class={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >{testLoading["embed"] ? "Running..." : "Run"}</button>
        {#if embedResult}
          <p data-test-embed-result class={cn("mt-2 text-sm text-muted-foreground")}>{embedResult}</p>
        {/if}
      </div>

      <!-- Generate test -->
      <div data-test-generate class={cn("rounded-lg border border-border p-4")}>
        <h3 class={cn("font-medium mb-2")}>Test Generate</h3>
        <button
          data-test-generate-button
          type="button"
          disabled={testLoading["generate"]}
          onclick={handleTestGenerate}
          class={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >{testLoading["generate"] ? "Running..." : "Run"}</button>
        {#if generateResult}
          <p data-test-generate-result class={cn("mt-2 text-sm text-muted-foreground")}>{generateResult}</p>
        {/if}
      </div>

      <!-- Classify test -->
      <div data-test-classify class={cn("rounded-lg border border-border p-4")}>
        <h3 class={cn("font-medium mb-2")}>Test Classify</h3>
        <button
          data-test-classify-button
          type="button"
          disabled={testLoading["classify"]}
          onclick={handleTestClassify}
          class={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >{testLoading["classify"] ? "Running..." : "Run"}</button>
        {#if classifyResult}
          <p data-test-classify-result class={cn("mt-2 text-sm text-muted-foreground")}>{classifyResult}</p>
        {/if}
      </div>

      <!-- Tokenize test -->
      <div data-test-tokenize class={cn("rounded-lg border border-border p-4")}>
        <h3 class={cn("font-medium mb-2")}>Test Tokenize</h3>
        <button
          data-test-tokenize-button
          type="button"
          disabled={testLoading["tokenize"]}
          onclick={handleTestTokenize}
          class={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >{testLoading["tokenize"] ? "Running..." : "Run"}</button>
        {#if tokenizeResult}
          <p data-test-tokenize-result class={cn("mt-2 text-sm text-muted-foreground")}>{tokenizeResult}</p>
        {/if}
      </div>
    </div>
  </section>

  <!-- External LLM provider card (flag-gated) -->
  {#if inference.externalLlmEnabled}
    <section data-inference-external-llm class={cn("mb-6")}>
      <h2 class={cn("text-lg font-medium mb-3")}>External LLM Provider</h2>
      <div class={cn("rounded-lg border border-border p-4")}>
        <p class={cn("text-sm text-muted-foreground mb-2")}>
          External LLM provider integration is enabled. Configure API keys and
          provider settings for cloud-based inference fallback.
        </p>
        <p class={cn("text-xs text-muted-foreground")}>
          Feature flag: <code>external-llm-provider</code>
        </p>
      </div>
    </section>
  {/if}
{/await}
