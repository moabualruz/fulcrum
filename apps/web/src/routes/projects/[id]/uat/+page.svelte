<script lang="ts">
  import { cn } from "@fulcrum/ui-kit";

  interface UatDecisionOption {
    id: string;
    label: string;
    description: string;
  }

  interface UatHandoff {
    projectId: string;
    traceId?: string;
    status: "ready" | "blocked";
    finalQaStatus: string;
    nextAction: string;
    decisionOptions: UatDecisionOption[];
    promptMarkdown: string;
  }

  interface DecisionResult {
    status: string;
    nextAction: string;
    decision: string;
  }

  interface Props {
    data: {
      projectId: string;
      handoff: UatHandoff | null;
    };
    form?: {
      ok: boolean;
      mode?: "decide";
      message?: string;
      decision?: DecisionResult;
      redirectTo?: string | null;
    };
  }

  let { data, form }: Props = $props();

  let selectedDecision = $state("approve_without_manual_review");
  let feedbackText = $state("");
</script>

<div data-testid="uat-page">
  <header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-6")}>
    <div class={cn("flex items-baseline gap-3")}>
      <a href="/projects/{data.projectId}" class={cn("text-sm text-muted-foreground hover:underline")}>
        &larr; Project
      </a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>User Acceptance Testing</h1>
    </div>
    <a
      href="/projects/{data.projectId}/review"
      class={cn("text-sm text-muted-foreground hover:underline")}
    >
      Review Workbench
    </a>
  </header>

  <!-- Handoff Status -->
  <section data-uat-status class={cn("mb-6 space-y-3")}>
    <h2 class={cn("text-lg font-semibold")}>Handoff Status</h2>
    {#if data.handoff}
      <div class={cn("grid gap-2 sm:grid-cols-3 rounded-md border border-border p-4")}>
        <div>
          <div class={cn("text-xs text-muted-foreground")}>Status</div>
          <div class={cn("font-medium", data.handoff.status === "ready" ? "text-green-600" : "text-yellow-600")}>
            {data.handoff.status}
          </div>
        </div>
        <div>
          <div class={cn("text-xs text-muted-foreground")}>Final QA</div>
          <div class={cn("font-medium")}>{data.handoff.finalQaStatus}</div>
        </div>
        <div>
          <div class={cn("text-xs text-muted-foreground")}>Next Action</div>
          <div class={cn("font-medium")}>{data.handoff.nextAction}</div>
        </div>
      </div>

      {#if data.handoff.traceId}
        <div class={cn("text-sm text-muted-foreground")}>
          Trace: {data.handoff.traceId}
        </div>
      {/if}
    {:else}
      <div class={cn("rounded-md border border-border p-4 text-sm text-muted-foreground")}>
        No UAT handoff available. Run final QA from the reports page first.
      </div>
    {/if}
  </section>

  <!-- Decision Form -->
  {#if data.handoff}
    <section data-uat-decision class={cn("mb-6 space-y-3")}>
      <h2 class={cn("text-lg font-semibold")}>UAT Decision</h2>
      <form method="POST" action="?/decide" class={cn("grid gap-4 rounded-md border border-border p-4")}>
        <input type="hidden" name="traceId" value={data.handoff.traceId ?? ""} />

        <fieldset class={cn("grid gap-2")}>
          <legend class={cn("text-sm font-medium text-muted-foreground mb-1")}>Decision</legend>
          {#each data.handoff.decisionOptions as option (option.id)}
            <label class={cn("flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-accent/50", selectedDecision === option.id && "border-primary bg-accent/30")}>
              <input
                type="radio"
                name="decision"
                value={option.id}
                checked={selectedDecision === option.id}
                onchange={() => selectedDecision = option.id}
                class={cn("mt-0.5")}
              />
              <div>
                <div class={cn("text-sm font-medium")}>{option.label}</div>
                <div class={cn("text-xs text-muted-foreground")}>{option.description}</div>
              </div>
            </label>
          {/each}
        </fieldset>

        {#if selectedDecision === "request_changes"}
          <label class={cn("grid gap-1 text-sm")}>
            <span class={cn("text-muted-foreground")}>Feedback</span>
            <textarea
              name="feedbackText"
              rows="4"
              bind:value={feedbackText}
              placeholder="Describe what needs to change..."
              class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
            ></textarea>
          </label>
        {/if}

        <button
          type="submit"
          disabled={data.handoff.status === "blocked"}
          class={cn(
            "h-10 rounded-md px-4 text-sm font-medium",
            selectedDecision === "approve_without_manual_review"
              ? "bg-green-600 text-white hover:bg-green-700"
              : selectedDecision === "request_changes"
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
            data.handoff.status === "blocked" && "opacity-50 cursor-not-allowed"
          )}
        >
          {#if selectedDecision === "approve_without_manual_review"}
            Approve
          {:else if selectedDecision === "request_changes"}
            Request Changes
          {:else if selectedDecision === "start_uat"}
            Start UAT
          {:else}
            Start Code Review
          {/if}
        </button>
      </form>
    </section>
  {/if}

  <!-- Decision Result -->
  {#if form?.mode === "decide" && form.ok && form.decision}
    <section data-uat-result class={cn("mb-6 space-y-3")}>
      <div class={cn("rounded-md border border-border p-4 text-sm")}>
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
        {#if form.redirectTo}
          <div class={cn("mt-3 text-sm")}>
            <a href={form.redirectTo} class={cn("text-primary hover:underline")}>
              Continue &rarr;
            </a>
          </div>
        {/if}
      </div>
    </section>
  {:else if form?.mode === "decide" && !form?.ok}
    <div class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive mb-6")}>
      {form?.message}
    </div>
  {/if}

  <!-- Prompt Markdown Preview -->
  {#if data.handoff?.promptMarkdown}
    <section data-uat-prompt class={cn("mb-6 space-y-3")}>
      <h2 class={cn("text-lg font-semibold")}>Handoff Prompt</h2>
      <pre class={cn("whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-xs font-mono")}>{data.handoff.promptMarkdown}</pre>
    </section>
  {/if}
</div>
