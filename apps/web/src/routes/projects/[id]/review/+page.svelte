<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface QaCheck {
    id: string;
    status: "pass" | "fail" | "warn";
    details: string;
  }

  interface QaReport {
    traceId: string;
    status: "passed" | "failed";
    nextAction: string;
    readyForUserAcceptance: boolean;
    summary: {
      taskCount: number;
      docCount: number;
      openFeedbackRunCount: number;
    };
    checks: QaCheck[];
  }

  interface ReviewSessionSummary {
    projectId: string;
    reviewId: string;
    reviewType: "plan" | "uat" | "code_review";
    title?: string;
    status: string;
    revision: number;
  }

  interface Props {
    data: {
      projectId: string;
      qaReport: QaReport | null;
    };
    form?: {
      ok: boolean;
      mode?: "startReview" | "loadSession" | "saveSession" | "annotate" | "uatDecision";
      message?: string;
      reviewWorkbench?: Record<string, unknown>;
      reviewSession?: ReviewSessionSummary;
      decision?: {
        status: string;
        nextAction: string;
        decision: string;
      };
    };
  }

  let { data, form }: Props = $props();

  const statusIcon: Record<string, string> = {
    pass: "PASS",
    fail: "FAIL",
    warn: "WARN",
  };
</script>

<div data-testid="review-workbench-page">
  <header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-6")}>
    <div class={cn("flex items-baseline gap-3")}>
      <a href="/projects/{data.projectId}" class={cn("text-sm text-muted-foreground hover:underline")}>
        &larr; Project
      </a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>Review Workbench</h1>
    </div>
  </header>

  <!-- QA Report Status -->
  <section data-qa-report class={cn("mb-6 space-y-3")}>
    <h2 class={cn("text-lg font-semibold")}>QA Report</h2>
    {#if data.qaReport}
      <div class={cn("grid gap-2 sm:grid-cols-4 rounded-md border border-border p-4")}>
        <div>
          <div class={cn("text-xs text-muted-foreground")}>Status</div>
          <div class={cn("font-medium", data.qaReport.status === "passed" ? "text-green-600" : "text-red-600")}>
            {data.qaReport.status}
          </div>
        </div>
        <div>
          <div class={cn("text-xs text-muted-foreground")}>Next Action</div>
          <div class={cn("font-medium")}>{data.qaReport.nextAction}</div>
        </div>
        <div>
          <div class={cn("text-xs text-muted-foreground")}>UAT Ready</div>
          <div class={cn("font-medium")}>{data.qaReport.readyForUserAcceptance ? "Yes" : "No"}</div>
        </div>
        <div>
          <div class={cn("text-xs text-muted-foreground")}>Open Feedback</div>
          <div class={cn("font-medium")}>{data.qaReport.summary.openFeedbackRunCount}</div>
        </div>
      </div>

      <div class={cn("grid gap-2 sm:grid-cols-3 text-sm text-muted-foreground")}>
        <div>Tasks: {data.qaReport.summary.taskCount}</div>
        <div>Docs: {data.qaReport.summary.docCount}</div>
        <div>Trace: {data.qaReport.traceId}</div>
      </div>

      <ul class={cn("space-y-2")}>
        {#each data.qaReport.checks as check (check.id)}
          <li class={cn("flex items-start gap-3 rounded border border-border px-3 py-2 text-sm")}>
            <span class={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold",
              check.status === "pass" ? "bg-green-100 text-green-800" :
              check.status === "fail" ? "bg-red-100 text-red-800" :
              "bg-yellow-100 text-yellow-800"
            )}>
              {statusIcon[check.status] ?? check.status}
            </span>
            <div>
              <span class={cn("font-medium")}>{check.id}</span>
              <div class={cn("text-muted-foreground")}>{check.details}</div>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <div class={cn("rounded-md border border-border p-4 text-sm text-muted-foreground")}>
        No QA report available. Run a QA check from the reports page first.
      </div>
    {/if}
  </section>

  <!-- Start Review -->
  <section data-start-review class={cn("mb-6 space-y-3")}>
    <h2 class={cn("text-lg font-semibold")}>Start Review</h2>
    <form method="POST" action="?/startReview" class={cn("grid gap-3 rounded-md border border-border p-4")}>
      <input type="hidden" name="traceId" value={`trace-review-${data.projectId}`} />
      <input type="hidden" name="reviewId" value={`review-${data.projectId}`} />
      <label class={cn("grid gap-1 text-sm")}>
        <span class={cn("text-muted-foreground")}>Search query</span>
        <input
          name="searchQuery"
          value=""
          class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
        />
      </label>
      <label class={cn("grid gap-1 text-sm")}>
        <span class={cn("text-muted-foreground")}>Diff files JSON (optional)</span>
        <textarea
          name="filesJson"
          rows="2"
          class={cn("w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs")}
        ></textarea>
      </label>
      <button
        type="submit"
        class={cn("h-9 rounded-md border border-border bg-primary px-4 text-sm font-medium text-primary-foreground")}
      >
        Start Review
      </button>
    </form>

    {#if form?.mode === "startReview" && form.ok && form.reviewWorkbench}
      <div data-start-review-result class={cn("rounded-md border border-border p-3 text-sm text-muted-foreground")}>
        Review workbench loaded.
      </div>
    {:else if form?.mode === "startReview" && !form?.ok}
      <div class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
        {form?.message}
      </div>
    {/if}
  </section>

  <!-- Review Sessions -->
  <section data-review-sessions class={cn("mb-6 space-y-3")}>
    <h2 class={cn("text-lg font-semibold")}>Review Sessions</h2>
    <div class={cn("grid gap-3 sm:grid-cols-2")}>
      <form method="POST" action="?/loadSession" class={cn("grid gap-2 rounded-md border border-border p-4")}>
        <input type="hidden" name="traceId" value={`trace-review-${data.projectId}`} />
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("text-muted-foreground")}>Review ID</span>
          <input
            name="reviewId"
            value={`review-${data.projectId}`}
            class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
          />
        </label>
        <button
          type="submit"
          class={cn("h-9 rounded-md border border-border bg-background px-3 text-sm font-medium")}
        >
          Load Session
        </button>
      </form>

      <form method="POST" action="?/saveSession" class={cn("grid gap-2 rounded-md border border-border p-4")}>
        <input type="hidden" name="traceId" value={`trace-review-${data.projectId}`} />
        <input type="hidden" name="reviewType" value="code_review" />
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("text-muted-foreground")}>Review ID</span>
          <input
            name="reviewId"
            value={`review-${data.projectId}`}
            class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
          />
        </label>
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("text-muted-foreground")}>Title</span>
          <input
            name="title"
            value="Review session"
            class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
          />
        </label>
        <button
          type="submit"
          class={cn("h-9 rounded-md border border-border bg-background px-3 text-sm font-medium")}
        >
          Save Session
        </button>
      </form>
    </div>

    {#if form?.mode === "loadSession" && form.ok && form.reviewSession}
      <div data-load-session-result class={cn("rounded-md border border-border p-3 text-sm")}>
        Loaded session <span class={cn("font-medium")}>{form.reviewSession.reviewId}</span>
        &mdash; {form.reviewSession.status} (rev {form.reviewSession.revision})
      </div>
    {:else if form?.mode === "loadSession" && !form?.ok}
      <div class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
        {form?.message}
      </div>
    {/if}

    {#if form?.mode === "saveSession" && form.ok && form.reviewSession}
      <div data-save-session-result class={cn("rounded-md border border-border p-3 text-sm")}>
        Saved session <span class={cn("font-medium")}>{form.reviewSession.reviewId}</span>
        &mdash; {form.reviewSession.status} (rev {form.reviewSession.revision})
      </div>
    {:else if form?.mode === "saveSession" && !form?.ok}
      <div class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
        {form?.message}
      </div>
    {/if}
  </section>

  <!-- Annotation Form -->
  <section data-annotation-form class={cn("mb-6 space-y-3")}>
    <h2 class={cn("text-lg font-semibold")}>Add Annotation</h2>
    <form method="POST" action="?/annotate" class={cn("grid gap-3 rounded-md border border-border p-4")}>
      <input type="hidden" name="reviewId" value={`review-${data.projectId}`} />
      <label class={cn("grid gap-1 text-sm")}>
        <span class={cn("text-muted-foreground")}>File path</span>
        <input
          name="filePath"
          placeholder="src/app.ts"
          class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
        />
      </label>
      <div class={cn("grid gap-3 sm:grid-cols-2")}>
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("text-muted-foreground")}>Line start</span>
          <input
            name="lineStart"
            type="number"
            value="1"
            class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
          />
        </label>
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("text-muted-foreground")}>Line end</span>
          <input
            name="lineEnd"
            type="number"
            value="1"
            class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
          />
        </label>
      </div>
      <label class={cn("grid gap-1 text-sm")}>
        <span class={cn("text-muted-foreground")}>Body</span>
        <textarea
          name="body"
          rows="3"
          placeholder="Describe the issue or suggestion..."
          class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
        ></textarea>
      </label>
      <label class={cn("grid gap-1 text-sm")}>
        <span class={cn("text-muted-foreground")}>Severity</span>
        <select
          name="severity"
          class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
        >
          <option value="">None</option>
          <option value="important">Important</option>
          <option value="nit">Nit</option>
          <option value="pre_existing">Pre-existing</option>
        </select>
      </label>
      <button
        type="submit"
        class={cn("h-9 rounded-md border border-border bg-background px-3 text-sm font-medium")}
      >
        Add Annotation
      </button>
    </form>

    {#if form?.mode === "annotate" && form.ok}
      <div data-annotate-result class={cn("rounded-md border border-border p-3 text-sm text-muted-foreground")}>
        Annotation added.
      </div>
    {:else if form?.mode === "annotate" && !form?.ok}
      <div class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
        {form?.message}
      </div>
    {/if}
  </section>

  <!-- UAT Decision -->
  <section data-uat-decision class={cn("mb-6 space-y-3")}>
    <h2 class={cn("text-lg font-semibold")}>UAT Decision</h2>
    <div class={cn("grid gap-3 sm:grid-cols-2")}>
      <form method="POST" action="?/uatDecision" class={cn("grid gap-2 rounded-md border border-border p-4")}>
        <input type="hidden" name="decision" value="approve_without_manual_review" />
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("text-muted-foreground")}>Feedback (optional)</span>
          <textarea
            name="feedbackText"
            rows="2"
            class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
          >Approved.</textarea>
        </label>
        <button
          type="submit"
          class={cn("h-9 rounded-md bg-green-600 px-4 text-sm font-medium text-white")}
        >
          Approve
        </button>
      </form>

      <form method="POST" action="?/uatDecision" class={cn("grid gap-2 rounded-md border border-border p-4")}>
        <input type="hidden" name="decision" value="request_changes" />
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("text-muted-foreground")}>Feedback</span>
          <textarea
            name="feedbackText"
            rows="2"
            placeholder="Describe what needs to change..."
            class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
          ></textarea>
        </label>
        <button
          type="submit"
          class={cn("h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white")}
        >
          Request Changes
        </button>
      </form>
    </div>

    {#if form?.mode === "uatDecision" && form.ok && form.decision}
      <div data-uat-decision-result class={cn("rounded-md border border-border p-4 text-sm")}>
        <div class={cn("grid gap-2 sm:grid-cols-3")}>
          <div>
            <div class={cn("text-xs text-muted-foreground")}>Status</div>
            <div class={cn("font-medium")}>{form.decision.status}</div>
          </div>
          <div>
            <div class={cn("text-xs text-muted-foreground")}>Decision</div>
            <div class={cn("font-medium")}>{form.decision.decision}</div>
          </div>
          <div>
            <div class={cn("text-xs text-muted-foreground")}>Next</div>
            <div class={cn("font-medium")}>{form.decision.nextAction}</div>
          </div>
        </div>
      </div>
    {:else if form?.mode === "uatDecision" && !form?.ok}
      <div class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
        {form?.message}
      </div>
    {/if}
  </section>
</div>
