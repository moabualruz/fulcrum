<script lang="ts">
  import type { PageData } from "./$types";
  import { buttonVariants } from "$lib/components/ui/button";
  import { cn } from "$lib/utils.js";
  import {
    DEFAULT_MEMORY_CONFIG,
    normalizeMemoryConfig,
    type MemoryConfig,
  } from "$lib/memory/memory-browser";

  interface Props {
    data: PageData;
  }

  const { data }: Props = $props();
  type ScopedProjectData = PageData & {
    orgId?: string | null;
    project: PageData["project"] & { orgId?: string | null; workspaceId?: string | null };
  };
  const scopedData = data as ScopedProjectData;
  let memory_config = $state<MemoryConfig>(normalizeMemoryConfig(data.memory_config));
  let saved = $state(false);

  function updateNumber(key: keyof MemoryConfig, event: Event): void {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    memory_config = normalizeMemoryConfig({ ...memory_config, [key]: value });
    saved = false;
  }

  function resetDefaults(): void {
    memory_config = { ...DEFAULT_MEMORY_CONFIG };
    saved = false;
  }

  async function save(): Promise<void> {
    await fetch(`/api/v1/projects/${encodeURIComponent(data.project.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orgId: scopedData.project.orgId ?? scopedData.project.workspaceId ?? scopedData.orgId ?? data.project.id,
        memory_config,
      }),
    });
    saved = true;
  }
</script>

<section data-project-memory-settings class={cn("flex max-w-3xl flex-col gap-5")}>
  <header class={cn("border-b border-border pb-4")}>
    <a href="/projects/{data.project.id}" class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Memory</h1>
  </header>

  <div class={cn("grid gap-4 rounded-md border border-border p-4")}>
    <label class={cn("grid gap-2 text-sm")}>
      BM25 weight
      <input
        name="bm25_weight"
        type="range"
        min="0"
        max="3"
        step="0.1"
        value={memory_config.bm25_weight}
        oninput={(event) => updateNumber("bm25_weight", event)}
      />
      <output>{memory_config.bm25_weight}</output>
    </label>

    <label class={cn("grid gap-2 text-sm")}>
      Recency weight
      <input
        name="recency_weight"
        type="range"
        min="0"
        max="3"
        step="0.1"
        value={memory_config.recency_weight}
        oninput={(event) => updateNumber("recency_weight", event)}
      />
      <output>{memory_config.recency_weight}</output>
    </label>

    <label class={cn("grid gap-2 text-sm")}>
      Importance boost
      <input
        name="importance_boost"
        type="range"
        min="0"
        max="5"
        step="0.1"
        value={memory_config.importance_boost}
        oninput={(event) => updateNumber("importance_boost", event)}
      />
      <output>{memory_config.importance_boost}</output>
    </label>

    <label class={cn("grid gap-2 text-sm")}>
      Token budget
      <input
        name="token_budget"
        type="number"
        min="512"
        max="32768"
        step="256"
        value={memory_config.token_budget}
        oninput={(event) => updateNumber("token_budget", event)}
        class={cn("h-9 max-w-xs rounded-md border border-input bg-background px-2")}
      />
    </label>

    <div class={cn("flex flex-wrap gap-2")}>
      <button type="button" class={cn(buttonVariants({ variant: "default" }))} onclick={() => void save()}>Save</button>
      <button type="button" class={cn(buttonVariants({ variant: "outline" }))} onclick={resetDefaults}>Reset defaults</button>
    </div>

    {#if saved}
      <p class={cn("text-sm text-muted-foreground")}>Memory settings saved.</p>
    {/if}
  </div>
</section>
