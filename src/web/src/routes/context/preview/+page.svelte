<script lang="ts">
  import type { PageData } from "./$types";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  type SliceKey = "memories" | "linkedDocs" | "recentRuns" | "repoState" | "skillPrompts";

  type ContextSlice = {
    tokenCount: number;
    content: string;
  };

  const slices: Array<{ key: SliceKey; label: string; empty: string }> = [
    { key: "memories", label: "Memories", empty: "No memory context available." },
    { key: "linkedDocs", label: "Linked Docs", empty: "No linked docs available." },
    { key: "recentRuns", label: "Recent Runs", empty: "No recent run context available." },
    { key: "repoState", label: "Repo State", empty: "No repo context available." },
    { key: "skillPrompts", label: "Skill Prompts", empty: "No skill prompt context available." },
  ];

  let { data }: Props = $props();

  function sliceFor(key: SliceKey): ContextSlice {
    return data.preview?.bundle.slices[key] ?? { tokenCount: 0, content: "" };
  }

  function previewText(slice: ContextSlice, empty: string): string {
    const text = slice.content.trim();
    if (!text) return empty;
    return text.slice(0, 200);
  }

  function percent(used: number, budget: number): number {
    if (budget <= 0) return 0;
    return Math.min(100, Math.round((used / budget) * 100));
  }
</script>

<section data-context-preview class={cn("flex flex-col gap-4")}>
  <header class={cn("flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4")}>
    <div>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>Context preview</h1>
      {#if data.taskId}
        <p class={cn("text-sm text-muted-foreground")}>Task {data.taskId}</p>
      {/if}
    </div>
    {#if data.preview?.snapshotId}
      <span class={cn("rounded border border-border px-2 py-1 text-xs text-muted-foreground")}>snapshot {data.preview.snapshotId}</span>
    {/if}
  </header>

  {#if data.errorMessage}
    <p data-context-preview-error class={cn("rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive")}>
      {data.errorMessage}
    </p>
  {:else if data.preview}
    {@const used = data.preview.bundle.tokenCount}
    {@const budget = data.preview.bundle.tokenBudget}
    {@const overBudget = used > budget}
    <div
      data-context-budget
      data-over-budget={overBudget ? "" : undefined}
      class={cn("rounded-md border border-border p-3", overBudget && "border-destructive bg-destructive/5")}
    >
      <div class={cn("mb-2 flex items-center justify-between gap-3 text-sm")}>
        <span class={cn("font-medium")}>Token budget</span>
        <span class={cn(overBudget ? "text-destructive" : "text-muted-foreground")}>{used} / {budget} tokens</span>
      </div>
      <div class={cn("h-2 overflow-hidden rounded bg-muted")}>
        <div
          class={cn("h-full rounded", overBudget ? "bg-destructive" : "bg-primary")}
          style={`width: ${percent(used, budget)}%`}
        ></div>
      </div>
    </div>

    <div class={cn("grid gap-3")}>
      {#each slices as item}
        {@const slice = sliceFor(item.key)}
        <details data-context-slice={item.key} class={cn("rounded-md border border-border")}>
          <summary data-context-toggle class={cn("flex cursor-pointer items-center justify-between gap-3 p-3")}>
            <span class={cn("font-medium")}>{item.label}</span>
            <span class={cn("text-sm text-muted-foreground")}>{slice.tokenCount} tokens</span>
          </summary>
          <div class={cn("border-t border-border p-3")}>
            <p class={cn("whitespace-pre-wrap text-sm text-muted-foreground")}>{previewText(slice, item.empty)}</p>
          </div>
        </details>
      {/each}
    </div>
  {/if}
</section>
