<script lang="ts">
  import { cn } from "@fulcrum/ui-kit";
  import type { EventRow } from "./+page.server.ts";

  interface Props {
    data: {
      events: EventRow[];
      total: number;
      page: number;
      actor: string;
      kind: string;
      verb: string;
      project: string;
      dateFrom: string;
      dateTo: string;
    };
  }

  let { data }: Props = $props();

  const PAGE_SIZE = 25;
  const totalPages = $derived(Math.ceil(data.total / PAGE_SIZE));

  type SortKey = "time" | "actor" | "verb";
  type SortDir = "asc" | "desc";

  let actor = $state(data.actor);
  let kind = $state(data.kind);
  let verb = $state(data.verb);
  let project = $state(data.project);
  let dateFrom = $state(data.dateFrom);
  let dateTo = $state(data.dateTo);
  let reasonSearch = $state("");
  let sortKey = $state<SortKey>("time");
  let sortDir = $state<SortDir>("desc");

  const filteredEvents = $derived(
    reasonSearch.trim()
      ? data.events.filter((event) => {
          const needle = reasonSearch.toLowerCase();
          return (
            event.verb.toLowerCase().includes(needle)
            || event.subject_kind.toLowerCase().includes(needle)
            || event.subject_id.toLowerCase().includes(needle)
            || event.actor.toLowerCase().includes(needle)
          );
        })
      : data.events,
  );

  const sortedEvents = $derived([...filteredEvents].sort((a, b) => {
    const key: keyof EventRow = sortKey === "time" ? "created_at" : sortKey === "actor" ? "actor" : "verb";
    const av = String(a[key] ?? "");
    const bv = String(b[key] ?? "");
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "desc" ? -cmp : cmp;
  }));

  function applySort(key: SortKey): void {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = key === "time" ? "desc" : "asc";
    }
  }

  function formatDate(iso: string): string {
    return iso.slice(0, 16).replace("T", " ");
  }

  function pageHref(p: number): string {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(p));
    return url.toString();
  }

  function exportData(format: "csv" | "json"): void {
    const rows = sortedEvents;
    let content: string;
    let mime: string;
    let filename: string;

    if (format === "json") {
      content = JSON.stringify(rows, null, 2);
      mime = "application/json";
      filename = "audit-log.json";
    } else {
      const header = "id,org_id,project_id,actor,subject_kind,subject_id,verb,created_at";
      const csvRows = rows.map((r) =>
        [r.id, r.org_id, r.project_id ?? "", r.actor, r.subject_kind, r.subject_id, r.verb, r.created_at]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );
      content = [header, ...csvRows].join("\n");
      mime = "text/csv";
      filename = "audit-log.csv";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<header class={cn("mb-4 flex items-center justify-between gap-4 border-b border-border pb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Audit log</h1>
  <div class={cn("flex gap-2")}>
    <button
      type="button"
      data-export-csv
      onclick={() => exportData("csv")}
      class={cn("rounded border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent")}
    >Export CSV</button>
    <button
      type="button"
      data-export-json
      onclick={() => exportData("json")}
      class={cn("rounded border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent")}
    >Export JSON</button>
  </div>
</header>

<!-- Filter toolbar -->
<form data-audit-filter method="GET" class={cn("mb-4 flex flex-wrap items-end gap-3 text-sm")}>
  <label class={cn("flex flex-col gap-1")}>
    <span class={cn("text-xs font-medium text-muted-foreground")}>Actor</span>
    <input
      type="text"
      name="actor"
      bind:value={actor}
      placeholder="system, local…"
      class={cn("h-8 rounded border border-input bg-background px-2 text-sm")}
    />
  </label>
  <label class={cn("flex flex-col gap-1")}>
    <span class={cn("text-xs font-medium text-muted-foreground")}>Event kind</span>
    <input
      type="text"
      name="kind"
      bind:value={kind}
      placeholder="task, doc, run…"
      data-audit-kind-input
      class={cn("h-8 rounded border border-input bg-background px-2 text-sm")}
    />
  </label>
  <label class={cn("flex flex-col gap-1")}>
    <span class={cn("text-xs font-medium text-muted-foreground")}>Verb</span>
    <input
      type="text"
      name="verb"
      bind:value={verb}
      placeholder="created, updated…"
      data-audit-verb-input
      class={cn("h-8 rounded border border-input bg-background px-2 text-sm")}
    />
  </label>
  <label class={cn("flex flex-col gap-1")}>
    <span class={cn("text-xs font-medium text-muted-foreground")}>Project</span>
    <input
      type="text"
      name="project"
      bind:value={project}
      placeholder="project id"
      data-audit-project-input
      class={cn("h-8 rounded border border-input bg-background px-2 text-sm")}
    />
  </label>
  <label class={cn("flex flex-col gap-1")}>
    <span class={cn("text-xs font-medium text-muted-foreground")}>From</span>
    <input
      type="date"
      name="date_from"
      bind:value={dateFrom}
      class={cn("h-8 rounded border border-input bg-background px-2 text-sm")}
    />
  </label>
  <label class={cn("flex flex-col gap-1")}>
    <span class={cn("text-xs font-medium text-muted-foreground")}>To</span>
    <input
      type="date"
      name="date_to"
      bind:value={dateTo}
      class={cn("h-8 rounded border border-input bg-background px-2 text-sm")}
    />
  </label>
  <label class={cn("flex flex-col gap-1")}>
    <span class={cn("text-xs font-medium text-muted-foreground")}>Reason / text</span>
    <input
      type="search"
      data-audit-reason-search
      bind:value={reasonSearch}
      placeholder="search verb, kind, subject…"
      class={cn("h-8 rounded border border-input bg-background px-2 text-sm")}
    />
  </label>
  <button
    type="submit"
    class={cn("h-8 rounded border border-input bg-background px-3 text-sm font-medium hover:bg-accent")}
  >Filter</button>
</form>

<p class={cn("mb-2 text-xs text-muted-foreground")}>
  {data.total} event{data.total === 1 ? "" : "s"}
</p>

{#if data.events.length === 0}
  <div
    data-audit-empty
    class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
  >No events match the current filters.</div>
{:else}
  <div class={cn("overflow-x-auto rounded-md border border-border")}>
    <table data-audit-table class={cn("w-full text-sm")}>
      <thead>
        <tr class={cn("border-b border-border bg-muted/50 text-left text-xs font-semibold text-muted-foreground")}>
          <th class={cn("px-3 py-2")}>
            <button type="button" data-audit-sort="time" data-audit-sort-active={sortKey === "time"} data-audit-sort-dir={sortKey === "time" ? sortDir : ""} class={cn("hover:underline")} onclick={() => applySort("time")}>
              Time {sortKey === "time" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </button>
          </th>
          <th class={cn("px-3 py-2")}>
            <button type="button" data-audit-sort="actor" data-audit-sort-active={sortKey === "actor"} data-audit-sort-dir={sortKey === "actor" ? sortDir : ""} class={cn("hover:underline")} onclick={() => applySort("actor")}>
              Actor {sortKey === "actor" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </button>
          </th>
          <th class={cn("px-3 py-2")}>Kind</th>
          <th class={cn("px-3 py-2")}>Subject</th>
          <th class={cn("px-3 py-2")}>
            <button type="button" data-audit-sort="verb" data-audit-sort-active={sortKey === "verb"} data-audit-sort-dir={sortKey === "verb" ? sortDir : ""} class={cn("hover:underline")} onclick={() => applySort("verb")}>
              Verb {sortKey === "verb" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {#each sortedEvents as ev (ev.id)}
          <tr data-audit-row={ev.id} class={cn("border-b border-border last:border-0 hover:bg-muted/30")}>
            <td class={cn("px-3 py-2 text-xs text-muted-foreground whitespace-nowrap")} data-audit-time>
              {formatDate(ev.created_at)}
            </td>
            <td class={cn("px-3 py-2")} data-audit-actor>{ev.actor}</td>
            <td class={cn("px-3 py-2")} data-audit-kind>{ev.subject_kind}</td>
            <td class={cn("px-3 py-2 font-mono text-xs")} data-audit-subject>{ev.subject_id}</td>
            <td class={cn("px-3 py-2")} data-audit-verb>{ev.verb}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if totalPages > 1}
    <nav data-audit-pagination class={cn("mt-4 flex items-center gap-2 text-sm")}>
      {#if data.page > 1}
        <a href={pageHref(data.page - 1)} class={cn("hover:underline")}>&larr; Prev</a>
      {/if}
      <span>Page {data.page} of {totalPages}</span>
      {#if data.page < totalPages}
        <a href={pageHref(data.page + 1)} class={cn("hover:underline")}>Next &rarr;</a>
      {/if}
    </nav>
  {/if}
{/if}
