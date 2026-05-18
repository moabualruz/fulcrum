<script lang="ts">
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { buttonVariants } from "@fulcrum/ui-kit";
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

  function retentionLabel(artifact: { archived?: boolean; retentionStatus?: string; retentionDaysRemaining?: number }) {
    if (artifact.archived) return "archived";
    if (artifact.retentionStatus) return artifact.retentionStatus;
    if (typeof artifact.retentionDaysRemaining === "number") return `${artifact.retentionDaysRemaining}d`;
    return "active";
  }

  function previewLabel(artifact: { mime?: string | null; title?: string; filename?: string }) {
    const mime = artifact.mime ?? "";
    const name = artifact.title ?? artifact.filename ?? "";
    if (mime === "image/png") return "image";
    if (mime === "text/markdown" || name.endsWith(".md")) return "markdown";
    if (mime.startsWith("text/")) return "text";
    if (mime === "application/json" || mime === "application/javascript" || name.match(/\.(ts|tsx|js|jsx|css|html)$/)) return "code";
    return "download";
  }
</script>

<header
  data-artifacts-header
  class={cn("mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4")}
>
  <div>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Artifacts</h1>
    <p class={cn("mt-1 text-sm text-muted-foreground")}>Review generated files, run outputs, previews, retention, and download links.</p>
  </div>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {@const artifacts = payload.artifacts}
  {@const loadError = payload.error}
  {@const mimeTypes = Array.from(new Set(artifacts.filter((a) => a.mime).map((a) => a.mime!))).sort()}
  {@const kinds = Array.from(new Set(artifacts.map((a) => a.kind))).sort()}
  {@const totalBytes = artifacts.reduce((sum, artifact) => sum + (artifact.size ?? 0), 0)}
  <section data-artifacts-summary class={cn("mb-3 grid gap-2 sm:grid-cols-3")}>
    <div class={cn("rounded-md border border-border bg-card px-3 py-2")}>
      <p class={cn("text-xs text-muted-foreground")}>Visible artifacts</p>
      <p class={cn("text-lg font-semibold")}>{artifacts.length}</p>
    </div>
    <div class={cn("rounded-md border border-border bg-card px-3 py-2")}>
      <p class={cn("text-xs text-muted-foreground")}>Selected</p>
      <p data-selected-count class={cn("text-lg font-semibold")}>{selected.size}</p>
    </div>
    <div class={cn("rounded-md border border-border bg-card px-3 py-2")}>
      <p class={cn("text-xs text-muted-foreground")}>Total size</p>
      <p class={cn("text-lg font-semibold")}>{totalBytes.toLocaleString()}</p>
    </div>
  </section>
  <form
    data-artifacts-filter
    method="GET"
    class={cn("mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3")}
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
        value="true"
        checked={data.filter.archived === "true"}
      />
      Show archived
    </label>
    <button
      data-apply-artifact-filters
      type="submit"
      class={cn(buttonVariants({ variant: "outline" }))}
    >Apply</button>
  </form>

  {#if loadError}
    <div
      data-artifacts-error
      class={cn("mb-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm")}
    >
      <p class={cn("font-medium")}>{loadError.message}</p>
      <p class={cn("mt-1 text-muted-foreground")}>{loadError.recovery}</p>
      <a href="/artifacts" class={cn("mt-2 inline-flex text-primary underline-offset-4 hover:underline")}>Retry trace {loadError.traceId}</a>
    </div>
  {/if}

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
      <div class={cn("flex flex-wrap gap-2")}>
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
      <div class={cn("hidden overflow-x-auto md:block")}>
      <table class={cn("w-full min-w-[860px] text-sm")}>
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
            <th class={cn("pb-2 font-medium")}>Run</th>
            <th class={cn("pb-2 font-medium")}>Preview</th>
            <th class={cn("pb-2 font-medium")}>Retention</th>
            <th class={cn("pb-2 font-medium text-right")}>Size</th>
            <th class={cn("pb-2 font-medium")}>Created</th>
            <th class={cn("pb-2 font-medium")}>Download</th>
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
              <td class={cn("py-2")}>
                {#if artifact.run_id}
                  <a data-artifact-run-link href="/runs/{artifact.run_id}" class={cn("text-primary underline-offset-4 hover:underline")}>run</a>
                {:else}
                  —
                {/if}
              </td>
              <td data-artifact-preview-kind={previewLabel(artifact)} class={cn("py-2")}>{previewLabel(artifact)}</td>
              <td data-artifact-retention-status class={cn("py-2")}>{retentionLabel(artifact)}</td>
              <td class={cn("py-2 text-right")}>{artifact.size != null ? artifact.size.toLocaleString() : "—"}</td>
              <td class={cn("py-2")}>{artifact.created_at.slice(0, 10)}</td>
              <td class={cn("py-2")}><a data-artifact-download-link href="/artifacts/{artifact.id}/download" class={cn("text-primary underline-offset-4 hover:underline")}>Download</a></td>
            </tr>
          {/each}
        </tbody>
      </table>
      </div>

      <div data-artifacts-mobile-list class={cn("space-y-2 md:hidden")}>
        {#each artifacts as artifact (artifact.id)}
          <article data-artifact-card={artifact.id} class={cn("rounded-md border border-border bg-card p-3")}>
            <div class={cn("flex items-start justify-between gap-3")}>
              <label class={cn("flex min-w-0 items-start gap-2")}>
                <input
                  data-artifact-card-checkbox={artifact.id}
                  type="checkbox"
                  checked={selected.has(artifact.id)}
                  onchange={() => toggleSelect(artifact.id)}
                  aria-label="Select {artifact.title}"
                />
                <span class={cn("min-w-0")}>
                  <a href="/artifacts/{artifact.id}" class={cn("break-words text-sm font-medium text-primary underline-offset-4 hover:underline")}>{artifact.title}</a>
                  <span class={cn("mt-1 block text-xs text-muted-foreground")}>{artifact.kind} · {artifact.mime ?? "application/octet-stream"}</span>
                </span>
              </label>
              <span data-artifact-retention-status class={cn("shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted-foreground")}>{retentionLabel(artifact)}</span>
            </div>
            <div class={cn("mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground")}>
              <span data-artifact-preview-kind={previewLabel(artifact)}>preview:{previewLabel(artifact)}</span>
              <span class={cn("text-right")}>{artifact.size != null ? artifact.size.toLocaleString() : "—"} bytes</span>
              <span>{artifact.created_at.slice(0, 10)}</span>
              {#if artifact.run_id}
                <a data-artifact-run-link href="/runs/{artifact.run_id}" class={cn("text-right text-primary underline-offset-4 hover:underline")}>run</a>
              {:else}
                <span class={cn("text-right")}>no run</span>
              {/if}
            </div>
            <div class={cn("mt-3 flex gap-2")}>
              <a href="/artifacts/{artifact.id}" class={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}>Open</a>
              <a data-artifact-download-link href="/artifacts/{artifact.id}/download" class={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}>Download</a>
            </div>
          </article>
        {/each}
      </div>
    </div>
  {/if}
{/await}
