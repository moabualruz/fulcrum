<script lang="ts">
  import { Badge, Button, Chip } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  type Artifact = {
    id: string;
    kind: "prototype" | "boilerplate" | "test";
    title: string;
    path: string;
    status: "Ready" | "Needs review";
    summary: string;
    checks: string[];
  };

  const artifacts: Artifact[] = [
    {
      id: "prototype",
      kind: "prototype",
      title: "Checkout recovery prototype",
      path: "artifacts/prototypes/checkout-recovery.html",
      status: "Ready",
      summary: "HTML interaction model for failed payment recovery, retry copy, and state handoff.",
      checks: ["desktop frame", "mobile frame", "keyboard path"],
    },
    {
      id: "boilerplate",
      kind: "boilerplate",
      title: "Workflow service boilerplate",
      path: "services/planning-review/src/application/technical-planning-cycle.ts",
      status: "Ready",
      summary: "Service boundary sketch with DTO names, repository seam, and task materialization inputs.",
      checks: ["service boundary", "DTO names", "task draft output"],
    },
    {
      id: "generated-e2e",
      kind: "test",
      title: "Generated E2E draft",
      path: "apps/web/tests/e2e/checkout-recovery.generated.spec.ts",
      status: "Needs review",
      summary: "Fixture-backed journey covering approval, change request, and task materialization.",
      checks: ["no network mocks", "trace id asserted", "approval gate asserted"],
    },
  ];

  const taskDrafts = [
    "Wire failed-payment retry action",
    "Persist recovery AuditEntry",
    "Expose generated E2E artifact in review",
  ];

  let selectedArtifact = $state(artifacts[0]);
  let decision = $state<"pending" | "approved" | "changes">("pending");
  let feedback = $state("Tighten retry copy and show how task materialization preserves the trace id.");
  let auditEntries = $state([
    "AuditEntry plan.prototype.opened trace_9f73",
    "AuditEntry artifact.previewed prototype",
  ]);

  function inspectArtifact(artifact: Artifact) {
    selectedArtifact = artifact;
    auditEntries = [`AuditEntry artifact.previewed ${artifact.id}`, ...auditEntries].slice(0, 4);
  }

  function approvePrototype() {
    decision = "approved";
    auditEntries = ["AuditEntry prototype.approved trace_9f73", "AuditEntry tasks.materialized queued=3", ...auditEntries].slice(0, 5);
  }

  function requestChanges() {
    decision = "changes";
    auditEntries = ["AuditEntry prototype.changes_requested trace_9f73", ...auditEntries].slice(0, 5);
  }
</script>

<svelte:head>
  <title>Prototype Review</title>
</svelte:head>

<main data-plan-prototypes-page class={cn("mx-auto flex w-full max-w-7xl flex-col gap-4 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8")}>
  <header class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4")}>
    <div class={cn("min-w-0")}>
      <p class={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground")}>Planning review gate</p>
      <h1 class={cn("text-2xl font-semibold tracking-normal text-foreground")}>Prototype and boilerplate review</h1>
      <p class={cn("mt-1 max-w-3xl text-sm text-muted-foreground")}>
        Inspect generated artifacts, make the approval decision explicit, and only materialize tasks after an AuditEntry-backed decision.
      </p>
    </div>
    <Badge variant={decision === "approved" ? "success" : decision === "changes" ? "warning" : "outline"} size="sm" data-decision-state>
      {decision === "approved" ? "Approved" : decision === "changes" ? "Changes requested" : "Pending decision"}
    </Badge>
  </header>

  <section class={cn("grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(22rem,1.05fr)]")}>
    <div class={cn("min-w-0 space-y-3")}>
      <div class={cn("grid gap-2")} data-artifact-list>
        {#each artifacts as artifact}
          <button
            type="button"
            data-artifact-card={artifact.id}
            data-selected={selectedArtifact.id === artifact.id}
            class={cn(
              "min-w-0 rounded-md border border-border bg-card p-3 text-left transition-colors",
              selectedArtifact.id === artifact.id && "border-primary bg-primary/5",
            )}
            onclick={() => inspectArtifact(artifact)}
          >
            <span class={cn("mb-2 flex flex-wrap items-center gap-2")}>
              <span class={cn("text-sm font-semibold")}>{artifact.title}</span>
              <Badge variant={artifact.status === "Ready" ? "success" : "warning"} size="sm">{artifact.status}</Badge>
              <Chip tone="neutral">{artifact.kind}</Chip>
            </span>
            <span class={cn("block break-all font-mono text-xs text-muted-foreground")}>{artifact.path}</span>
            <span class={cn("mt-2 block text-sm text-muted-foreground")}>{artifact.summary}</span>
          </button>
        {/each}
      </div>

      <section data-decision-panel class={cn("min-w-0 overflow-hidden rounded-md border border-border bg-muted/35 p-3")}>
        <div class={cn("flex flex-wrap items-center gap-2")}>
          <h2 class={cn("text-base font-semibold")}>Decision</h2>
          <span class={cn("flex-1")}></span>
          <Button size="sm" data-approve-prototype onclick={approvePrototype}>Approve</Button>
          <Button size="sm" variant="outline" data-request-changes onclick={requestChanges}>Request changes</Button>
        </div>
        <label class={cn("mt-3 grid gap-1 text-sm font-medium")}>
          Change request note
          <textarea
            data-change-request-note
            class={cn("min-h-24 w-full min-w-0 resize-y rounded-md border border-input bg-background p-3 text-sm text-foreground")}
            bind:value={feedback}
          ></textarea>
        </label>
      </section>
    </div>

    <aside class={cn("min-w-0 space-y-3")}>
      <section data-artifact-preview class={cn("min-w-0 overflow-hidden rounded-md border border-border bg-card p-3")}>
        <div class={cn("flex flex-wrap items-center gap-2")}>
          <h2 class={cn("text-base font-semibold")}>{selectedArtifact.title}</h2>
          <Badge variant={selectedArtifact.status === "Ready" ? "success" : "warning"} size="sm">{selectedArtifact.status}</Badge>
        </div>
        <div class={cn("mt-3 aspect-video rounded-md border border-border bg-muted/60 p-4")}>
          <div class={cn("flex h-full flex-col justify-between rounded-md border border-dashed border-border bg-background p-3")}>
            <p class={cn("text-sm font-medium")}>Inspectable artifact preview</p>
            <p class={cn("max-w-md text-sm text-muted-foreground")}>{selectedArtifact.summary}</p>
            <p class={cn("break-all font-mono text-xs text-muted-foreground")}>{selectedArtifact.path}</p>
          </div>
        </div>
        <div data-review-checks class={cn("mt-3 flex flex-wrap gap-2")}>
          {#each selectedArtifact.checks as check}
            <Chip tone="accent">{check}</Chip>
          {/each}
        </div>
      </section>

      <section data-task-materialization class={cn("min-w-0 overflow-hidden rounded-md border border-border bg-muted/35 p-3")}>
        <div class={cn("flex flex-wrap items-center gap-2")}>
          <h2 class={cn("text-base font-semibold")}>Task materialization</h2>
          <Badge variant={decision === "approved" ? "success" : "outline"} size="sm">
            {decision === "approved" ? "Queued" : "Awaiting approval"}
          </Badge>
        </div>
        <ul class={cn("mt-3 grid gap-2 text-sm")}>
          {#each taskDrafts as task}
            <li class={cn("rounded-md border border-border bg-background px-3 py-2")}>{task}</li>
          {/each}
        </ul>
      </section>

      <section data-audit-entry-feed class={cn("min-w-0 overflow-hidden rounded-md border border-border bg-card p-3")}>
        <h2 class={cn("text-base font-semibold")}>Decision AuditEntry</h2>
        <ol class={cn("mt-3 grid gap-2 text-xs text-muted-foreground")}>
          {#each auditEntries as entry}
            <li class={cn("break-all rounded-md border border-border bg-background px-3 py-2 font-mono")}>{entry}</li>
          {/each}
        </ol>
      </section>
    </aside>
  </section>
</main>
