<script lang="ts">
  const timeline = [
    {
      kind: "message",
      title: "Run started",
      time: "10:12:04",
      body: "Mode build · project Agent Workflow · trace run_01HYZ",
    },
    {
      kind: "tool",
      title: "apply_patch",
      time: "10:12:41",
      body: "apps/web/src/routes/runs/[id]/+page.svelte updated",
      result: "0",
    },
    {
      kind: "diff",
      title: "Diff preview",
      time: "10:13:02",
      body: "+ live session pane\n+ artifact action rail\n- hidden log-only detail",
    },
    {
      kind: "approval",
      title: "Approval gate",
      time: "10:13:20",
      body: "Cancel requires explicit confirmation before stopping active process.",
    },
  ];

  const artifacts = [
    { name: "workspace.diff", kind: "diff", state: "linked", href: "/runs/run_01HYZ/artifacts" },
    { name: "handoff.md", kind: "doc", state: "memory candidate", href: "/artifacts/art_02" },
  ];
</script>

<svelte:head><title>Run detail | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-6xl space-y-4 p-4 sm:p-6" data-run-detail-fixture>
  <header class="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
    <div class="space-y-2">
      <a href="/runs" class="text-sm text-muted-foreground hover:underline">← Runs</a>
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-semibold tracking-tight">codex</h1>
        <span class="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">running</span>
        <code class="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">run_01HYZ</code>
      </div>
      <p class="max-w-2xl text-sm text-muted-foreground">Run detail explains what happened, what changed, what artifacts were produced, and which action is safe next.</p>
    </div>
    <div class="flex gap-2">
      <button type="button" data-runs-cancel-trigger class="h-9 rounded-md border border-destructive/60 bg-destructive/10 px-3 text-sm font-medium text-destructive">Cancel run</button>
      <button type="button" data-runs-retry-trigger class="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium">Retry run</button>
    </div>
  </header>

  <!--
    The OD live session pane (DESIGN.md §8 — list / plan strip / transcript /
    workspace dock, tool-call cards, inline diffs, permission prompts,
    checkpoint timeline, abort modal) is delivered on the canonical Build runs
    surface. This fixture is preserved for its existing coverage but defers the
    live-session experience to `/build-runs`, so run detail does not duplicate.
  -->
  <a
    data-run-detail-canonical-pane
    href="/build-runs"
    class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
  >
    <span aria-hidden="true">⏵</span>
    <span>Open the live session pane on the Build runs feed.</span>
  </a>

  <section data-run-workflow-summary class="grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-4">
    <div><h2 class="text-sm font-semibold">Live state</h2><p data-run-live-state class="mt-1 text-xs text-muted-foreground">Status running · elapsed 8m</p></div>
    <div><h2 class="text-sm font-semibold">Workflow</h2><a data-run-workflow-link href="/projects/project_alpha/runs" class="mt-1 block text-xs text-primary hover:underline">Project runs</a></div>
    <div><h2 class="text-sm font-semibold">Context</h2><p data-run-context-source-count class="mt-1 text-xs text-muted-foreground">3 source refs</p></div>
    <div><h2 class="text-sm font-semibold">Trace</h2><p data-run-trace-link class="mt-1 font-mono text-xs text-muted-foreground">trace_run_01HYZ</p></div>
  </section>

  <section data-ai-assist-live-session class="rounded-md border border-border bg-background">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
      <div>
        <h2 class="text-sm font-semibold">AI Assist live session</h2>
        <p class="text-xs text-muted-foreground">Transcript, tool calls, diffs, approvals, artifacts, and stream recovery.</p>
      </div>
      <label class="inline-flex items-center gap-2 text-xs text-muted-foreground"><input data-live-autoscroll-toggle type="checkbox" checked class="h-4 w-4 rounded border-border" /> Autoscroll</label>
    </div>
    <div data-live-session-disconnect class="border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Stream reconnects through polling if live transport drops.</div>
    <ol data-tool-call-timeline class="max-h-[42vh] space-y-2 overflow-auto p-3">
      {#each timeline as item}
        <li data-live-session-item={item.kind} data-tool-call-card={item.kind === "tool" ? item.title : undefined} data-diff-preview={item.kind === "diff" ? item.title : undefined} data-approval-gate={item.kind === "approval" ? item.title : undefined} class="rounded-md border border-border bg-muted/20 p-3 text-xs">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{item.title}</span>
            <span class="rounded bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">{item.kind}</span>
            {#if item.result}<span data-tool-result-status class="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{item.result}</span>{/if}
            <span class="font-mono text-[10px] text-muted-foreground">{item.time}</span>
          </div>
          <pre class="mt-2 whitespace-pre-wrap text-[11px] text-muted-foreground">{item.body}</pre>
        </li>
      {/each}
    </ol>
    <div data-live-file-diff-pane class="border-t border-border p-3">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div><h3 class="text-sm font-semibold">File changes</h3><p data-file-scope-validation class="text-xs text-muted-foreground">1 changed file · deletions marked · scope validated before unsafe writes</p></div>
        <code class="rounded bg-muted px-1.5 py-0.5 text-[11px]">apps/web/src/routes/runs/[id]/+page.svelte</code>
      </div>
      <ol data-live-unified-diff class="rounded-md border border-border bg-muted/20 font-mono text-[11px]">
        <li data-diff-line="file" class="grid grid-cols-[4rem_4rem_minmax(0,1fr)] gap-2 bg-muted px-2 py-0.5 font-semibold"><span></span><span></span><code>diff --git a/+page.svelte b/+page.svelte</code></li>
        <li data-diff-line="delete" class="grid grid-cols-[4rem_4rem_minmax(0,1fr)] gap-2 bg-destructive/10 px-2 py-0.5 text-destructive"><span class="text-right text-muted-foreground">12</span><span></span><code>- hidden log-only detail</code></li>
        <li data-diff-line="add" class="grid grid-cols-[4rem_4rem_minmax(0,1fr)] gap-2 bg-emerald-500/10 px-2 py-0.5 text-emerald-800"><span></span><span class="text-right text-muted-foreground">12</span><code>+ live state and artifact actions</code></li>
      </ol>
    </div>
  </section>

  <section data-runs-artifacts class="grid gap-3 md:grid-cols-2">
    {#each artifacts as artifact}
      <article class="rounded-md border border-border bg-background p-3 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium">{artifact.name}</span>
          <span class="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{artifact.kind}</span>
          <span data-runs-artifact-retention class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{artifact.state}</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <a href={artifact.href} class="h-8 rounded-md border border-input px-3 py-1.5 text-xs font-medium">Open</a>
          <button type="button" data-runs-artifact-archive class="h-8 rounded-md border border-input px-3 text-xs font-medium">Archive</button>
          <button type="button" data-runs-artifact-promote-memory class="h-8 rounded-md border border-input px-3 text-xs font-medium">Promote memory</button>
        </div>
      </article>
    {/each}
  </section>
</main>
