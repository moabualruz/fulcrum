<script lang="ts">
  type DiffSource = "unstaged" | "staged" | "branch" | "pull";
  type Destination = "local-agent" | "platform-review";
  type GateState = "retryable" | "blocked" | "exhausted";

  interface DiffLine {
    file: string;
    line: number;
    side: "old" | "new";
    kind: "context" | "removed" | "added";
    text: string;
  }

  interface FeedbackRun {
    id: string;
    agent: string;
    status: "pending" | "running" | "completed";
    latestVerdict: "REVISE" | "APPROVE" | "UNAVAILABLE";
    attempt: number;
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

  const FEEDBACK_RUNS: FeedbackRun[] = [
    {
      id: "qa-feedback-17",
      agent: "qa-reviewer",
      status: "running",
      latestVerdict: "REVISE",
      attempt: 2,
    },
    {
      id: "implementation-feedback-18",
      agent: "codex",
      status: "pending",
      latestVerdict: "UNAVAILABLE",
      attempt: 3,
    },
    {
      id: "review-feedback-19",
      agent: "review-agent",
      status: "completed",
      latestVerdict: "APPROVE",
      attempt: 3,
    },
  ];

  let selectedSource = $state<DiffSource>("unstaged");
  let destination = $state<Destination>("local-agent");
  let selectedLine = $state(DIFF_LINES[1]);
  let annotationText = $state("Preserve this line as the artifact proof anchor before approval.");
  let feedbackSent = $state(false);
  let approved = $state(false);
  let gateState = $state<GateState>("retryable");
  let blockedReason = $state("");
  let blockedOwner = $state("");
  let exhaustionReason = $state("Max automated feedback attempts reached with final QA passing.");
  let exhaustionRecorded = $state(false);

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
  const retryableFeedbackExists = $derived(gateState === "retryable");
  const blockedReady = $derived(blockedReason.trim().length > 0 && blockedOwner.trim().length > 0);
  const uatUnlocked = $derived(gateState === "exhausted");

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

  function setGateState(nextState: GateState): void {
    gateState = nextState;
    exhaustionRecorded = false;
  }

  function recordExhaustion(): void {
    if (!uatUnlocked) return;
    exhaustionRecorded = true;
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

  <section data-qa-feedback-gate class="grid gap-4 rounded-md border border-border bg-background p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
    <div class="min-w-0 space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase text-muted-foreground">FinalQaReport gate</p>
          <h2 class="text-lg font-semibold">Automated feedback exhaustion</h2>
          <p class="max-w-3xl text-sm text-muted-foreground">
            UAT stays locked until task, QA, and review feedback loops finish, exhaust their retry cap, or declare a blocked owner.
          </p>
        </div>
        <div class="flex flex-wrap gap-2 text-xs">
          <button type="button" data-gate-retryable onclick={() => setGateState("retryable")} class="rounded-md border border-border px-2 py-1">Retryable</button>
          <button type="button" data-gate-blocked onclick={() => setGateState("blocked")} class="rounded-md border border-border px-2 py-1">Blocked</button>
          <button type="button" data-gate-exhausted onclick={() => setGateState("exhausted")} class="rounded-md border border-border px-2 py-1">Exhausted</button>
        </div>
      </div>

      <div data-feedback-runs class="grid gap-2 md:grid-cols-3">
        {#each FEEDBACK_RUNS as run (run.id)}
          <article class="min-w-0 rounded-md border border-border p-3">
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-medium">{run.agent}</span>
              <span data-run-status={run.id} class="rounded-md bg-muted px-2 py-1 text-xs">{run.status}</span>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">Attempt {run.attempt} / 3</p>
            <p data-latest-verdict={run.id} class="mt-1 text-sm">Latest verdict: <strong>{run.latestVerdict}</strong></p>
          </article>
        {/each}
      </div>

      {#if gateState === "retryable"}
        <p data-gate-explanation class="rounded-md border border-amber-600/30 bg-amber-600/10 p-3 text-sm text-amber-900">
          UAT disabled: retryable QA feedback exists and automation has not exhausted configured attempts.
        </p>
      {:else if gateState === "blocked"}
        <div data-blocked-state class="grid gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 md:grid-cols-2">
          <label class="flex flex-col gap-1 text-xs">
            Blocked reason
            <input data-blocked-reason bind:value={blockedReason} class="rounded-md border border-border bg-background px-2 py-2 text-sm" placeholder="Reviewer unavailable" />
          </label>
          <label class="flex flex-col gap-1 text-xs">
            Owner
            <input data-blocked-owner bind:value={blockedOwner} class="rounded-md border border-border bg-background px-2 py-2 text-sm" placeholder="mo" />
          </label>
          <button type="button" data-record-blocked disabled={!blockedReady} class="rounded-md border border-border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">
            Record blocked state
          </button>
          {#if blockedReady}
            <p data-blocked-record class="text-sm">Blocked by {blockedOwner}: {blockedReason}</p>
          {/if}
        </div>
      {:else}
        <p data-gate-explanation class="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm text-emerald-800">
          UAT unlocked: automation exhausted after 3 attempts and latest verdicts no longer require retryable feedback.
        </p>
      {/if}
    </div>

    <aside class="min-w-0 space-y-3 rounded-md border border-border p-3" data-uat-handoff-panel>
      <h2 class="text-sm font-semibold">UatCodeReviewHandoff</h2>
      <button type="button" data-start-uat disabled={retryableFeedbackExists} class="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
        Start UAT
      </button>
      <label class="flex flex-col gap-1 text-xs">
        Exhaustion reason
        <textarea data-exhaustion-reason bind:value={exhaustionReason} rows="4" class="w-full rounded-md border border-border bg-background p-2 text-sm"></textarea>
      </label>
      <button type="button" data-record-exhaustion disabled={!uatUnlocked} onclick={recordExhaustion} class="w-full rounded-md border border-border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">
        Record exhaustion approval
      </button>
      {#if exhaustionRecorded}
        <p data-exhaustion-record class="rounded-md border border-primary/30 bg-primary/10 p-2 text-xs">
          Approval recorded because {exhaustionReason}
        </p>
      {/if}
    </aside>
  </section>
</main>
