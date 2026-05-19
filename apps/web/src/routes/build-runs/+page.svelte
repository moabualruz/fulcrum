<script lang="ts">
  type DiffSource = "unstaged" | "staged" | "branch" | "pull";
  type Destination = "local-agent" | "platform-review";

  interface DiffLine {
    file: string;
    line: number;
    side: "old" | "new";
    kind: "context" | "removed" | "added";
    text: string;
  }

  const DIFF_SOURCES: Array<{
    id: DiffSource;
    label: string;
    base: string;
    head: string;
    description: string;
  }> = [
    {
      id: "unstaged",
      label: "Unstaged",
      base: "workspace:index",
      head: "workspace:working-tree",
      description: "Local edits not yet staged.",
    },
    {
      id: "staged",
      label: "Staged",
      base: "HEAD",
      head: "index",
      description: "Index snapshot ready for commit.",
    },
    {
      id: "branch",
      label: "Branch",
      base: "dev/v1.0",
      head: "feat/review-loop",
      description: "Current branch compared with integration base.",
    },
    {
      id: "pull",
      label: "Review request",
      base: "origin/dev/v1.0",
      head: "review/42/head",
      description: "PR-equivalent review ref with remote identity.",
    },
  ];

  const DIFF_LINES: DiffLine[] = [
    {
      file: "apps/web/src/routes/runs/[id]/+page.svelte",
      line: 84,
      side: "old",
      kind: "removed",
      text: "- <p>Run completed.</p>",
    },
    {
      file: "apps/web/src/routes/runs/[id]/+page.svelte",
      line: 85,
      side: "new",
      kind: "added",
      text: "+ <p data-live-state>Run completed with artifact proof.</p>",
    },
    {
      file: "services/planning-review/src/application/reviews/review-workbench.ts",
      line: 142,
      side: "new",
      kind: "added",
      text: "+ scheduleFollowUpRun({ path, lineStart, lineEnd, feedback });",
    },
    {
      file: "services/planning-review/src/domain/review-acceptance.ts",
      line: 118,
      side: "context",
      kind: "context",
      text: "  nextAction: \"feedback_run_scheduled\";",
    },
  ];

  let selectedSource = $state<DiffSource>("unstaged");
  let destination = $state<Destination>("local-agent");
  let selectedLine = $state(DIFF_LINES[1]);
  let annotationText = $state("Preserve this line as the artifact proof anchor before approval.");
  let feedbackSent = $state(false);
  let approved = $state(false);

  const source = $derived(DIFF_SOURCES.find((item) => item.id === selectedSource) ?? DIFF_SOURCES[0]);
  const annotationRange = $derived(`${selectedLine.file}:${selectedLine.line}-${selectedLine.line}`);
  const exportPayload = $derived({
    destination,
    source: selectedSource,
    base: source.base,
    head: source.head,
    annotation: {
      path: selectedLine.file,
      lineStart: selectedLine.line,
      lineEnd: selectedLine.line,
      text: annotationText,
    },
  });

  function selectLine(line: DiffLine): void {
    selectedLine = line;
    feedbackSent = false;
    approved = false;
  }

  function sendFeedback(): void {
    feedbackSent = true;
    approved = false;
  }

  function approveDiff(): void {
    approved = true;
  }
</script>

<svelte:head>
  <title>Code review loop | Fulcrum</title>
</svelte:head>

<main data-build-runs-review class="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
  <header class="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
    <div class="space-y-1">
      <p class="text-xs font-semibold uppercase text-muted-foreground">Build / Review</p>
      <h1 class="text-2xl font-semibold tracking-tight">Code review loop</h1>
      <p class="max-w-3xl text-sm text-muted-foreground">
        Load a local diff, anchor feedback to changed lines, and send the exact file range back to the responsible agent run.
      </p>
    </div>
    <div data-review-identity class="grid min-w-0 gap-1 rounded-md border border-border bg-background p-3 text-xs">
      <span>Base <strong data-review-base>{source.base}</strong></span>
      <span>Head <strong data-review-head>{source.head}</strong></span>
    </div>
  </header>

  <section data-diff-source-picker class="grid gap-2 md:grid-cols-4">
    {#each DIFF_SOURCES as option (option.id)}
      <button
        type="button"
        data-diff-source={option.id}
        data-selected={selectedSource === option.id}
        onclick={() => selectedSource = option.id}
        class="min-w-0 rounded-md border border-border bg-background p-3 text-left text-sm hover:bg-accent data-[selected=true]:border-primary data-[selected=true]:bg-primary/10"
      >
        <span class="block font-medium">{option.label}</span>
        <span class="mt-1 block text-xs text-muted-foreground">{option.description}</span>
      </button>
    {/each}
  </section>

  <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
    <section data-diff-workbench class="min-w-0 rounded-md border border-border bg-background">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <div>
          <h2 class="text-sm font-semibold">Unified diff</h2>
          <p class="text-xs text-muted-foreground">Line numbers and file paths stay stable after source changes.</p>
        </div>
        <div class="flex gap-2 text-xs">
          <button type="button" class="rounded-md border border-border px-2 py-1">Split</button>
          <button type="button" class="rounded-md border border-border px-2 py-1">Unified</button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full table-fixed border-collapse text-sm">
          <thead class="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th class="w-20 px-3 py-2">Line</th>
              <th class="px-3 py-2">File</th>
              <th class="px-3 py-2">Change</th>
              <th class="w-24 px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {#each DIFF_LINES as line (line.file + line.line + line.side)}
              <tr data-diff-line={line.line} data-line-kind={line.kind} class="border-t border-border">
                <td class="px-3 py-2 font-mono text-xs text-muted-foreground">{line.side}:{line.line}</td>
                <td class="break-all px-3 py-2 font-mono text-xs">{line.file}</td>
                <td class="break-all px-3 py-2 font-mono text-xs {line.kind === 'added' ? 'text-emerald-700' : line.kind === 'removed' ? 'text-destructive' : 'text-muted-foreground'}">{line.text}</td>
                <td class="px-3 py-2">
                  <button
                    type="button"
                    data-annotate-line={line.line}
                    onclick={() => selectLine(line)}
                    class="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                  >Annotate</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <aside data-review-sidebar class="min-w-0 space-y-4 rounded-md border border-border bg-background p-4">
      <section class="space-y-2" data-inline-annotation>
        <div>
          <h2 class="text-sm font-semibold">Inline annotation</h2>
          <p class="text-xs text-muted-foreground">Anchored to <span data-annotation-range class="break-all">{annotationRange}</span></p>
        </div>
        <textarea
          data-annotation-text
          bind:value={annotationText}
          rows="5"
          class="w-full rounded-md border border-border bg-background p-2 text-sm"
          aria-label="Annotation feedback"
        ></textarea>
      </section>

      <section class="space-y-2" data-feedback-export>
        <h2 class="text-sm font-semibold">Feedback export</h2>
        <label class="flex flex-col gap-1 text-xs">
          Destination
          <select data-feedback-destination bind:value={destination} class="rounded-md border border-border bg-background px-2 py-2 text-sm">
            <option value="local-agent">Local agent run</option>
            <option value="platform-review">Platform review thread</option>
          </select>
        </label>
        <pre data-feedback-payload class="max-h-48 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">{JSON.stringify(exportPayload, null, 2)}</pre>
        <button type="button" data-send-feedback onclick={sendFeedback} class="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          Send feedback to agent
        </button>
        {#if feedbackSent}
          <p data-feedback-run class="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-2 text-xs text-emerald-800">
            Follow-up run scheduled with {annotationRange}.
          </p>
        {/if}
      </section>

      <section class="space-y-2" data-approval-panel>
        <h2 class="text-sm font-semibold">Approval</h2>
        <p class="text-xs text-muted-foreground">Approval records the diff identity before merge-quality claims.</p>
        <button type="button" data-approve-diff onclick={approveDiff} class="w-full rounded-md border border-border px-3 py-2 text-sm font-medium">
          Approve reviewed diff
        </button>
        {#if approved}
          <p data-approval-record class="rounded-md border border-primary/30 bg-primary/10 p-2 text-xs">
            Approved {source.base} -> {source.head} with annotation {annotationRange}.
          </p>
        {/if}
      </section>
    </aside>
  </div>
</main>
