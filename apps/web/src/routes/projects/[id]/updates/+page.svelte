<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface Props {
    data: {
      projectId: string;
    };
    form?: {
      ok: boolean;
      message?: string;
      result?: {
        status: string;
        trigger: string;
        traceId?: string;
        eventId: string;
        changedDocCount: number;
        targetTaskCount: number;
      };
    };
  }

  let { data, form }: Props = $props();
</script>

<div data-testid="continuous-update-page">
  <header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-6")}>
    <div class={cn("flex items-baseline gap-3")}>
      <a href="/projects/{data.projectId}" class={cn("text-sm text-muted-foreground hover:underline")}>
        &larr; Project
      </a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>Continuous Updates</h1>
    </div>
  </header>

  <!-- Trigger Update Form -->
  <section data-trigger-form class={cn("mb-6 space-y-3")}>
    <h2 class={cn("text-lg font-semibold")}>Trigger Update</h2>
    <form method="POST" action="?/triggerUpdate" class={cn("grid gap-3 rounded-md border border-border p-4")}>
      <label class={cn("grid gap-1 text-sm")}>
        <span class={cn("text-muted-foreground")}>Trigger type</span>
        <select
          name="trigger"
          class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
        >
          <option value="manual_doc_edit">Manual doc edit</option>
          <option value="acp_session_update">ACP session update</option>
        </select>
      </label>
      <label class={cn("grid gap-1 text-sm")}>
        <span class={cn("text-muted-foreground")}>User prompt</span>
        <textarea
          name="userPrompt"
          rows="4"
          placeholder="Describe what changed and what should be replanned..."
          class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
        ></textarea>
      </label>
      <label class={cn("grid gap-1 text-sm")}>
        <span class={cn("text-muted-foreground")}>Trace ID (optional)</span>
        <input
          name="traceId"
          placeholder="e.g. trace-abc-123"
          class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
        />
      </label>
      <div class={cn("flex gap-3")}>
        <button
          type="submit"
          class={cn("h-9 rounded-md border border-border bg-primary px-4 text-sm font-medium text-primary-foreground")}
        >
          Trigger Update
        </button>
        <button
          type="submit"
          formaction="?/triggerAndRedirect"
          class={cn("h-9 rounded-md border border-border bg-background px-4 text-sm font-medium")}
        >
          Trigger &amp; Return to Project
        </button>
      </div>
    </form>

    {#if form?.ok && form.result}
      <div data-trigger-result class={cn("rounded-md border border-border p-4 text-sm")}>
        <div class={cn("grid gap-2 sm:grid-cols-3")}>
          <div>
            <div class={cn("text-xs text-muted-foreground")}>Status</div>
            <div class={cn("font-medium text-green-600")}>{form.result.status}</div>
          </div>
          <div>
            <div class={cn("text-xs text-muted-foreground")}>Trigger</div>
            <div class={cn("font-medium")}>{form.result.trigger}</div>
          </div>
          <div>
            <div class={cn("text-xs text-muted-foreground")}>Event ID</div>
            <div class={cn("font-medium font-mono text-xs")}>{form.result.eventId}</div>
          </div>
        </div>
        {#if form.result.traceId}
          <div class={cn("mt-2 text-xs text-muted-foreground")}>
            Trace: {form.result.traceId}
          </div>
        {/if}
        <div class={cn("mt-2 text-xs text-muted-foreground")}>
          Changed docs: {form.result.changedDocCount} &middot; Target tasks: {form.result.targetTaskCount}
        </div>
      </div>
    {:else if form && !form.ok}
      <div class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
        {form.message}
      </div>
    {/if}
  </section>
</div>
