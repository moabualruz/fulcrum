<script lang="ts">
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { buttonVariants } from "$lib/components/ui/button";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let selected: Set<string> = $state(new Set());
  let showConfirmDelete = $state(false);

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  function toggleAll(artifacts: { id: string }[]) {
    if (selected.size === artifacts.length) {
      selected = new Set();
    } else {
      selected = new Set(artifacts.map((a) => a.id));
    }
  }

  async function bulkArchive() {
    // Client-side iteration calling tRPC per item (MVP approach per issue notes)
    const form = new FormData();
    form.set("ids", JSON.stringify([...selected]));
    form.set("action", "archive");
    await fetch("?/bulk", { method: "POST", body: form });
    selected = new Set();
    // Refresh via navigation
    window.location.reload();
  }

  async function bulkDelete() {
    const form = new FormData();
    form.set("ids", JSON.stringify([...selected]));
    form.set("action", "delete");
    await fetch("?/bulk", { method: "POST", body: form });
    selected = new Set();
    showConfirmDelete = false;
    window.location.reload();
  }
</script>

<header
  data-artifacts-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Artifacts</h1>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {@const artifacts = payload.artifacts}
  {@const mimeTypes = Array.from(new Set(artifacts.filter((a) => a.mime).map((a) => a.mime!))).sort()}
  {@const kinds = Array.from(new Set(artifacts.map((a) => a.kind))).sort()}
  <form
    data-artifacts-filter
    method="GET"
    class={cn("mb-3 flex flex-wrap items-center gap-2")}
  >
    <select
      data-artifacts-mime-filter
      name="mime"
      aria-label="Filter by MIME type"
      class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
    >
      <option value="" selected={data.filter.mime === ""}>All types</option>
      {#each mimeTypes as mime (mime)}
        <option value={mime} selected={data.filter.mime === mime}>{mime}</option>
      {/each}
    </select>
    <select
      data-artifacts-kind-filter
      name="kind"
      aria-label="Filter by kind"
      class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
    >
      <option value="" selected={data.filter.kind === ""}>All kinds</option>
      {#each kinds as kind (kind)}
        <option value={kind} selected={data.filter.kind === kind}>{kind}</option>
      {/each}
    </select>
    <label class={cn("flex items-center gap-1 text-sm")}>
      <input
        data-show-archived-toggle
        type="checkbox"
        name="archived"
        checked={data.filter.archived === "true"}
      />
      Show archived
    </label>
    <button
      type="submit"
      class={cn(buttonVariants({ variant: "outline" }))}
    >Apply</button>
  </form>

  {#if selected.size > 0}
    <div
      data-bulk-action-bar
      class={cn("mb-3 flex items-center gap-2 rounded-md border border-border bg-muted p-2 text-sm")}
    >
      <span>{selected.size} selected</span>
      <button
        data-bulk-archive
        type="button"
        class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        onclick={bulkArchive}
      >Archive selected</button>
      <button
        data-bulk-delete
        type="button"
        class={cn(buttonVariants({ variant: "destructive", size: "sm" }))}
        onclick={() => (showConfirmDelete = true)}
      >Delete selected</button>
    </div>
  {/if}

  {#if showConfirmDelete}
    <div
      data-confirm-delete-modal
      class={cn("mb-3 rounded-md border border-destructive bg-destructive/10 p-4 text-sm")}
    >
      <p class={cn("font-medium mb-2")}>Delete {selected.size} artifact(s)?</p>
      <ul class={cn("mb-2 list-disc pl-5")}>
        {#each artifacts.filter((a) => selected.has(a.id)) as artifact (artifact.id)}
          <li>{artifact.title}</li>
        {/each}
      </ul>
      <div class={cn("flex gap-2")}>
        <button
          data-confirm-delete-yes
          type="button"
          class={cn(buttonVariants({ variant: "destructive", size: "sm" }))}
          onclick={bulkDelete}
        >Confirm delete</button>
        <button
          data-confirm-delete-cancel
          type="button"
          class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          onclick={() => (showConfirmDelete = false)}
        >Cancel</button>
      </div>
    </div>
  {/if}

  {#if artifacts.length === 0}
    <div
      data-empty-artifacts
      class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
    >No artifacts match the current filters.</div>
  {:else}
    <div data-artifacts-list>
      <table class={cn("w-full text-sm")}>
        <thead>
          <tr class={cn("border-b border-border text-left")}>
            <th class={cn("pb-2 w-8")}>
              <input
                data-select-all
                type="checkbox"
                checked={selected.size === artifacts.length && artifacts.length > 0}
                onchange={() => toggleAll(artifacts)}
                aria-label="Select all"
              />
            </th>
            <th class={cn("pb-2 font-medium")}>Title</th>
            <th class={cn("pb-2 font-medium")}>Kind</th>
            <th class={cn("pb-2 font-medium")}>MIME</th>
            <th class={cn("pb-2 font-medium text-right")}>Size</th>
            <th class={cn("pb-2 font-medium")}>Created</th>
          </tr>
        </thead>
        <tbody>
          {#each artifacts as artifact (artifact.id)}
            <tr data-artifact-row={artifact.id} class={cn("border-b border-border/50")}>
              <td class={cn("py-2")}>
                <input
                  data-artifact-checkbox={artifact.id}
                  type="checkbox"
                  checked={selected.has(artifact.id)}
                  onchange={() => toggleSelect(artifact.id)}
                  aria-label="Select {artifact.title}"
                />
              </td>
              <td class={cn("py-2")}>
                <a href="/artifacts/{artifact.id}" class={cn("text-primary underline-offset-4 hover:underline")}>{artifact.title}</a>
                {#if artifact.archived}
                  <span data-archived-badge class={cn("ml-1 rounded bg-yellow-200 px-1.5 py-0.5 text-xs font-medium text-yellow-800")}>Archived</span>
                {/if}
              </td>
              <td class={cn("py-2")}>{artifact.kind}</td>
              <td class={cn("py-2")}>{artifact.mime ?? "—"}</td>
              <td class={cn("py-2 text-right")}>{artifact.size != null ? artifact.size.toLocaleString() : "—"}</td>
              <td class={cn("py-2")}>{artifact.created_at.slice(0, 10)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/await}
