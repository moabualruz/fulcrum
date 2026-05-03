<script lang="ts">
  import type { PageData } from "./$types";
  import MarkdownPreview from "$lib/components/markdown/MarkdownPreview.svelte";
  import { buttonVariants } from "$lib/components/ui/button";
  import { cn } from "$lib/utils.js";
  import {
    buildMemorySourceHref,
    optimisticMemoryAction,
    shouldConfirmMetadataEdit,
    type MemoryRow,
  } from "$lib/memory/memory-browser";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let memory = $state<MemoryRow | null>(null);
  let editTags = $state("");
  let editImportance = $state("medium");
  let showConfirm = $state(false);
  let errorMessage = $state<string | null>(null);

  $effect(() => {
    void loadMemory();
  });

  $effect(() => {
    if (memory) {
      editTags = memory.tags.join(", ");
      editImportance = memory.importance;
    }
  });

  async function trpc<T>(procedure: string, input: unknown): Promise<T> {
    const response = await fetch(`/api/trpc/${procedure}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: input }),
    });
    if (!response.ok) throw new Error(await response.text());
    const payload = await response.json();
    return (payload.result?.data?.json ?? payload.result?.data ?? payload.json ?? payload) as T;
  }

  async function loadMemory(): Promise<void> {
    try {
      memory = await trpc<MemoryRow>("memory.get", { id: data.id });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Memory request failed.";
    }
  }

  function confirmMetadataEdit(): void {
    if (!memory) return;
    if (shouldConfirmMetadataEdit(memory.source)) {
      showConfirm = true;
      return;
    }
    void saveMetadata(false);
  }

  async function saveMetadata(forceEdit: boolean): Promise<void> {
    if (!memory) return;
    const tags = editTags.split(",").map((tag) => tag.trim()).filter(Boolean);
    memory = await trpc<MemoryRow>("memory.update", {
      id: memory.id,
      tags,
      importance: editImportance,
      forceEdit,
    });
    showConfirm = false;
  }

  async function archiveMemory(): Promise<void> {
    if (!memory) return;
    memory = optimisticMemoryAction(memory, "archive");
    await trpc("memory.update", { id: memory.id, archived: true });
  }

  async function promoteMemory(): Promise<void> {
    if (!memory) return;
    memory = optimisticMemoryAction(memory, "promote");
    await trpc("memory.update", { id: memory.id, importance: "high" });
  }

  async function restoreMemory(): Promise<void> {
    if (!memory) return;
    memory = optimisticMemoryAction(memory, "restore");
    await trpc("memory.update", { id: memory.id, archived: false });
  }
</script>

<section data-memory-detail class={cn("mx-auto flex max-w-5xl flex-col gap-5")}>
  <header class={cn("flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4")}>
    <div>
      <a href="/memory" class={cn("text-sm text-muted-foreground hover:underline")}>← Memory</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>Memory detail</h1>
    </div>
    {#if memory}
      <div class={cn("flex flex-wrap gap-2")}>
        <button type="button" class={cn(buttonVariants({ variant: "outline" }))} onclick={promoteMemory}>Promote</button>
        {#if memory.archived}
          <button type="button" class={cn(buttonVariants({ variant: "outline" }))} onclick={restoreMemory}>Restore</button>
        {:else}
          <button type="button" class={cn(buttonVariants({ variant: "outline" }))} onclick={archiveMemory}>Archive</button>
        {/if}
      </div>
    {/if}
  </header>

  {#if errorMessage}
    <p class={cn("text-sm text-destructive")}>{errorMessage}</p>
  {:else if !memory}
    <p class={cn("text-sm text-muted-foreground")}>Loading memory…</p>
  {:else}
    <article class={cn("grid gap-4")}>
      <div class={cn("rounded-md border border-border p-4")}>
        <MarkdownPreview value={memory.body} />
      </div>

      <section class={cn("grid gap-3 rounded-md border border-border p-4 md:grid-cols-2")}>
        <label class={cn("grid gap-1 text-sm")}>
          Importance
          <select bind:value={editImportance} class={cn("h-9 rounded-md border border-input bg-background px-2")}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <label class={cn("grid gap-1 text-sm")}>
          Tags
          <input bind:value={editTags} class={cn("h-9 rounded-md border border-input bg-background px-2")} />
        </label>
        <div class={cn("flex items-end")}>
          <button type="button" class={cn(buttonVariants({ variant: "default" }))} onclick={confirmMetadataEdit}>Save metadata</button>
        </div>
      </section>

      <section class={cn("grid gap-2 rounded-md border border-border p-4 text-sm")}>
        <div><span class={cn("text-muted-foreground")}>Kind:</span> {memory.kind}</div>
        <div><span class={cn("text-muted-foreground")}>Source:</span> {memory.source}</div>
        <div><span class={cn("text-muted-foreground")}>Project:</span> {memory.projectId ?? "org"}</div>
        {#if buildMemorySourceHref(memory.sourceRef)}
          <a data-memory-source-ref href={buildMemorySourceHref(memory.sourceRef) ?? ""} class={cn("text-primary hover:underline")}>Source reference</a>
        {:else}
          <span data-memory-source-ref class={cn("text-muted-foreground")}>No source reference</span>
        {/if}
      </section>

      <section data-memory-links class={cn("rounded-md border border-border p-4")}>
        <h2 class={cn("mb-2 text-sm font-medium")}>Linked entities</h2>
        {#if !memory.links || memory.links.length === 0}
          <p class={cn("text-sm text-muted-foreground")}>No linked entities.</p>
        {:else}
          <ul class={cn("grid gap-1 text-sm")}>
            {#each memory.links as link}
              <li>{link.targetKind}: {link.label ?? link.targetId}</li>
            {/each}
          </ul>
        {/if}
      </section>
    </article>
  {/if}

  {#if showConfirm}
    <div role="dialog" aria-modal="true" class={cn("fixed inset-0 z-50 grid place-items-center bg-background/80 p-4")}>
      <div class={cn("grid max-w-md gap-3 rounded-md border border-border bg-background p-4 shadow-lg")}>
        <h2 class={cn("font-semibold")}>Confirm metadata edit</h2>
        <p class={cn("text-sm text-muted-foreground")}>This memory came from a heuristic or LLM source.</p>
        <div class={cn("flex justify-end gap-2")}>
          <button type="button" class={cn(buttonVariants({ variant: "outline" }))} onclick={() => showConfirm = false}>Cancel</button>
          <button type="button" class={cn(buttonVariants({ variant: "default" }))} onclick={() => void saveMetadata(true)}>Save</button>
        </div>
      </div>
    </div>
  {/if}
</section>
