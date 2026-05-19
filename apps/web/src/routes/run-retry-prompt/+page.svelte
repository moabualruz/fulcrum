<script lang="ts">
  type Run = { id: string; parentId: string | null; prompt: string; status: "failed" | "running" | "done"; promptDiff?: { from: string; to: string } };

  const ORIGINAL = "Refactor cycle save to use Zod. Validate inputs.";

  let runs = $state<Run[]>([
    { id: "r1", parentId: null, prompt: ORIGINAL, status: "failed" },
  ]);
  let activeId = $state<string>("r1");
  let editorOpen = $state(false);
  let editedPrompt = $state(ORIGINAL);

  function openRetry(): void {
    editorOpen = true;
    editedPrompt = ORIGINAL;
  }

  function confirm(): void {
    const parent = runs.find((r) => r.id === activeId);
    if (!parent) return;
    const newId = `r${runs.length + 1}`;
    runs = [
      ...runs,
      { id: newId, parentId: parent.id, prompt: editedPrompt, status: "running", promptDiff: { from: parent.prompt, to: editedPrompt } },
    ];
    editorOpen = false;
  }

  function activate(id: string): void { activeId = id; }
</script>

<svelte:head><title>Retry with prompt diff | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-retry-prompt-page>
  <h1 class="text-2xl font-semibold">Retry with prompt diff</h1>

  <ul class="space-y-2" data-retry-runs>
    {#each runs as r}
      <button
        type="button"
        data-retry-run={r.id}
        data-retry-run-status={r.status}
        data-retry-run-parent={r.parentId ?? ""}
        onclick={() => activate(r.id)}
        class="block w-full rounded-md border border-border bg-background p-3 text-left text-sm"
      >
        {r.id} · {r.status}{r.parentId ? ` · retry of ${r.parentId}` : ""}
      </button>
    {/each}
  </ul>

  {#if runs.find((r) => r.id === activeId)?.status === "failed"}
    <button type="button" data-retry-open onclick={openRetry} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Retry with edited prompt</button>
  {/if}

  {#if editorOpen}
    <section role="dialog" data-retry-editor class="grid gap-3 md:grid-cols-2">
      <div class="space-y-1">
        <p class="text-xs text-muted-foreground">Original</p>
        <pre data-retry-original class="overflow-auto rounded-md bg-muted p-2 text-xs">{ORIGINAL}</pre>
      </div>
      <div class="space-y-1">
        <p class="text-xs text-muted-foreground">New (edit)</p>
        <textarea data-retry-new bind:value={editedPrompt} rows="4" class="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"></textarea>
      </div>
      <button type="button" data-retry-confirm onclick={confirm} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground md:col-span-2">Confirm retry</button>
    </section>
  {/if}

  {#if runs.length > 1}
    {@const latest = runs[runs.length - 1]!}
    <p data-retry-diff-trace class="text-xs text-muted-foreground">
      Retry trace: parent <span data-retry-diff-parent>{latest.parentId}</span> · diff from "<span data-retry-diff-from>{latest.promptDiff?.from}</span>" to "<span data-retry-diff-to>{latest.promptDiff?.to}</span>"
    </p>
  {/if}
</main>
