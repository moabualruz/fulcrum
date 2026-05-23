<script lang="ts">
  import { Select } from "@fulcrum/ui-kit";
  type LabelScope = "global" | "project";
  type Label = { id: string; name: string; color: string; scope: LabelScope; project?: string };
  type Doc = { id: string; title: string; labels: string[] };

  let labels = $state<Label[]>([
    { id: "l1", name: "rfc", color: "blue", scope: "global" },
    { id: "l2", name: "runbook", color: "green", scope: "global" },
    { id: "l3", name: "api-design", color: "purple", scope: "project", project: "fulcrum" },
  ]);
  let docs = $state<Doc[]>([
    { id: "d1", title: "Search indexing plan", labels: ["l1"] },
    { id: "d2", title: "Local-first deploy", labels: ["l1", "l2"] },
    { id: "d3", title: "Migration policies", labels: ["l3"] },
  ]);
  let filter = $state<string | "all">("all");
  let savedViews = $state<{ name: string; filter: string }[]>([{ name: "RFCs only", filter: "l1" }]);
  let auditLog = $state<string[]>([]);
  let userCanEdit = $state(true);
  let viewName = $state("");
  let newLabelName = $state("");
  let newLabelScope = $state<LabelScope>("global");

  function addLabel(event: Event): void {
    event.preventDefault();
    if (!userCanEdit || !newLabelName.trim()) return;
    const id = `l${labels.length + 1}`;
    labels = [...labels, { id, name: newLabelName.trim(), color: "gray", scope: newLabelScope, project: newLabelScope === "project" ? "fulcrum" : undefined }];
    newLabelName = "";
    auditLog = [...auditLog, `label-create:${id}`];
  }

  function toggleDocLabel(docId: string, labelId: string): void {
    if (!userCanEdit) return;
    docs = docs.map((d) => (d.id === docId ? { ...d, labels: d.labels.includes(labelId) ? d.labels.filter((x) => x !== labelId) : [...d.labels, labelId] } : d));
    auditLog = [...auditLog, `doc-label-toggle:${docId}:${labelId}`];
  }

  function saveView(): void {
    if (!viewName.trim()) return;
    savedViews = [...savedViews, { name: viewName.trim(), filter }];
    viewName = "";
  }

  const filteredDocs = $derived(filter === "all" ? docs : docs.filter((d) => d.labels.includes(filter)));
</script>

<svelte:head><title>Document labels | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-doc-labels-page>
  <h1 class="text-2xl font-semibold">Document labels</h1>

  <label class="flex items-center gap-2 text-xs">
    <input type="checkbox" data-doc-labels-permission bind:checked={userCanEdit} />
    User can edit labels (permission)
  </label>

  <form onsubmit={addLabel} class="flex flex-wrap items-end gap-2 rounded-md border border-border p-3" data-doc-labels-create>
    <label class="flex flex-col gap-1 text-xs">
      Name
      <input data-doc-labels-new-name bind:value={newLabelName} disabled={!userCanEdit} class="rounded-md border border-border bg-background px-2 py-1 text-sm" />
    </label>
    <label class="flex flex-col gap-1 text-xs">
      Scope
      <select data-doc-labels-new-scope bind:value={newLabelScope} disabled={!userCanEdit} class="rounded-md border border-border bg-background px-2 py-1 text-sm">
        <option value="global">global</option>
        <option value="project">project</option>
      </select>
    </label>
    <button type="submit" data-doc-labels-add disabled={!userCanEdit} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Add label</button>
  </form>

  <ul class="flex flex-wrap gap-2" data-doc-labels-list>
    {#each labels as l}
      <li data-label-row={l.id} data-label-scope={l.scope} class="rounded-md border border-border px-2 py-0.5 text-xs">{l.name} ({l.scope})</li>
    {/each}
  </ul>

  <div class="flex flex-wrap items-center gap-2">
    <label class="flex items-center gap-1 text-xs">
      Filter
      <select data-doc-labels-filter bind:value={filter} class="rounded-md border border-border bg-background px-2 py-1 text-xs">
        <option value="all">all</option>
        {#each labels as l}<option value={l.id}>{l.name}</option>{/each}
      </select>
    </label>
    <input data-doc-labels-view-name bind:value={viewName} placeholder="Saved view name" class="rounded-md border border-border bg-background px-2 py-1 text-xs" />
    <button type="button" data-doc-labels-save-view onclick={saveView} class="rounded-md border border-border px-3 py-1 text-xs">Save view</button>
  </div>
  <ul class="flex flex-wrap gap-2 text-xs" data-doc-labels-saved-views>
    {#each savedViews as v}<li data-saved-view={v.name}>{v.name}</li>{/each}
  </ul>

  <ul class="space-y-2" data-doc-labels-docs>
    {#each filteredDocs as d}
      <li data-doc-row={d.id} class="space-y-1 rounded-md border border-border p-3">
        <p class="text-sm font-medium">{d.title}</p>
        <ul class="flex flex-wrap gap-1 text-xs">
          {#each labels as l}
            <li>
              <button
                type="button"
                data-doc-label-toggle={`${d.id}:${l.id}`}
                data-doc-label-on={d.labels.includes(l.id)}
                onclick={() => toggleDocLabel(d.id, l.id)}
                disabled={!userCanEdit}
                class="rounded-md border border-border px-2 py-0.5"
              >
                {l.name}{d.labels.includes(l.id) ? " ✓" : ""}
              </button>
            </li>
          {/each}
        </ul>
      </li>
    {/each}
  </ul>

  <details class="text-xs">
    <summary>Audit log</summary>
    <ul data-doc-labels-audit>
      {#each auditLog as entry}<li>{entry}</li>{/each}
    </ul>
  </details>
</main>
