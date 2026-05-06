<script lang="ts">
  /**
   * RecurrenceConfig — popover for configuring task recurrence rules (D-116).
   *
   * Three modes: on_schedule (cron), after_completion (days), on_close (days).
   * Shows next scheduled date, occurrence count, and bounds.
   * Actions: create / delete / update rule via trpc.recurrence.
   */
  import { cn } from "$lib/utils.js";

  // ── Types ────────────────────────────────────────────────────────────────────

  type RecurrenceMode = "on_schedule" | "after_completion" | "on_close";

  interface RecurrenceRule {
    id: string;
    mode: RecurrenceMode;
    intervalDays?: number | null;
    cronExpression?: string | null;
    daysOfWeek?: number[] | null;
    timeOfDay?: string | null;
    nextOccurrence?: string | null;
    occurrenceCount?: number;
    endDate?: string | null;
    maxOccurrences?: number | null;
  }

  // ── Props ────────────────────────────────────────────────────────────────────

  interface Props {
    taskId: string;
    existingRule?: RecurrenceRule | null;
    trpc?: {
    recurrence: {
      create: { mutate: (input: {
        taskId: string;
        mode: RecurrenceMode;
        intervalDays?: number;
        daysOfWeek?: number[];
        timeOfDay?: string;
        endDate?: string;
        maxOccurrences?: number;
      }) => Promise<RecurrenceRule> };
      delete: { mutate: (input: { ruleId: string }) => Promise<void> };
    };
    } | null;
  }

  let { taskId, existingRule = null, trpc = null }: Props = $props();

  // ── State ────────────────────────────────────────────────────────────────────

  let open = false;
  let mode: RecurrenceMode = existingRule?.mode ?? "on_schedule";
  let intervalDays = existingRule?.intervalDays ?? 7;
  let selectedDays: number[] = existingRule?.daysOfWeek ?? [1]; // Mon
  let timeOfDay = existingRule?.timeOfDay ?? "09:00";
  let endDate = existingRule?.endDate ?? "";
  let maxOccurrences = existingRule?.maxOccurrences ?? null;
  let submitting = false;
  let error = "";

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MODE_LABELS: Record<RecurrenceMode, string> = {
    on_schedule: "On schedule",
    after_completion: "After completion",
    on_close: "On close",
  };

  function toggleDay(d: number) {
    if (selectedDays.includes(d)) {
      selectedDays = selectedDays.filter((x) => x !== d);
    } else {
      selectedDays = [...selectedDays, d].sort();
    }
  }

  async function save() {
    if (!trpc) return;
    submitting = true;
    error = "";
    try {
      const rule = await trpc.recurrence.create.mutate({
        taskId,
        mode,
        intervalDays: mode !== "on_schedule" ? intervalDays : undefined,
        daysOfWeek: mode === "on_schedule" ? selectedDays : undefined,
        timeOfDay: mode === "on_schedule" ? timeOfDay : undefined,
        endDate: endDate || undefined,
        maxOccurrences: maxOccurrences ?? undefined,
      });
      existingRule = rule;
      open = false;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      submitting = false;
    }
  }

  async function deleteRule() {
    if (!trpc || !existingRule) return;
    submitting = true;
    error = "";
    try {
      await trpc.recurrence.delete.mutate({ ruleId: existingRule.id });
      existingRule = null;
      open = false;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to delete";
    } finally {
      submitting = false;
    }
  }
</script>

<!-- Trigger badge -->
<button
  onclick={() => (open = !open)}
  class={cn(
    "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors",
    existingRule
      ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
      : "border-border text-muted-foreground hover:bg-muted"
  )}
>
  <svg class={cn("w-3 h-3")} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4v4l3 2" stroke-linecap="round" />
  </svg>
  {existingRule ? "Recurring" : "Repeat"}
</button>

<!-- Popover -->
{#if open}
  <div class={cn("absolute z-50 mt-1 w-72 rounded-lg border border-border bg-popover shadow-md p-4 flex flex-col gap-3")}>
    <div class={cn("flex items-center justify-between")}>
      <h4 class={cn("text-sm font-semibold")}>Recurrence</h4>
      <button onclick={() => (open = false)} class={cn("text-muted-foreground hover:text-foreground text-xs")}>✕</button>
    </div>

    {#if error}
      <p class={cn("text-xs text-destructive")}>{error}</p>
    {/if}

    <!-- Mode picker -->
    <div class={cn("flex flex-col gap-1")}>
      <label class={cn("text-xs font-medium")}>Mode</label>
      <select bind:value={mode} class={cn("h-8 rounded-md border border-input px-2 text-sm bg-background")}>
        {#each Object.entries(MODE_LABELS) as [val, label]}
          <option value={val}>{label}</option>
        {/each}
      </select>
    </div>

    <!-- Mode-specific config -->
    {#if mode === "on_schedule"}
      <div class={cn("flex flex-col gap-1")}>
        <label class={cn("text-xs font-medium")}>Days of week</label>
        <div class={cn("flex gap-1 flex-wrap")}>
          {#each DAY_LABELS as day, i}
            <button
              onclick={() => toggleDay(i)}
              class={cn(
                "text-xs px-2 py-0.5 rounded border transition-colors",
                selectedDays.includes(i)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              )}
            >{day}</button>
          {/each}
        </div>
      </div>
      <div class={cn("flex flex-col gap-1")}>
        <label class={cn("text-xs font-medium")}>Time</label>
        <input type="time" bind:value={timeOfDay} class={cn("h-8 rounded-md border border-input px-2 text-sm bg-background")} />
      </div>
    {:else}
      <div class={cn("flex flex-col gap-1")}>
        <label class={cn("text-xs font-medium")}>Interval (days)</label>
        <input
          type="number"
          bind:value={intervalDays}
          min="1"
          max="365"
          class={cn("h-8 rounded-md border border-input px-2 text-sm bg-background")}
        />
      </div>
    {/if}

    <!-- Bounds -->
    <div class={cn("grid grid-cols-2 gap-2")}>
      <div class={cn("flex flex-col gap-1")}>
        <label class={cn("text-xs font-medium")}>End date</label>
        <input type="date" bind:value={endDate} class={cn("h-8 rounded-md border border-input px-2 text-xs bg-background")} />
      </div>
      <div class={cn("flex flex-col gap-1")}>
        <label class={cn("text-xs font-medium")}>Max occurrences</label>
        <input
          type="number"
          bind:value={maxOccurrences}
          min="1"
          placeholder="∞"
          class={cn("h-8 rounded-md border border-input px-2 text-xs bg-background")}
        />
      </div>
    </div>

    <!-- Existing rule info -->
    {#if existingRule}
      <div class={cn("text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5")}>
        {#if existingRule.nextOccurrence}
          <div>Next: {new Date(existingRule.nextOccurrence).toLocaleDateString()}</div>
        {/if}
        {#if (existingRule.occurrenceCount ?? 0) > 0}
          <div>{existingRule.occurrenceCount} occurrence{existingRule.occurrenceCount === 1 ? "" : "s"} created</div>
        {/if}
      </div>
    {/if}

    <!-- Actions -->
    <div class={cn("flex gap-2 justify-between")}>
      {#if existingRule}
        <button
          onclick={deleteRule}
          disabled={submitting}
          class={cn("text-xs px-2 py-1 rounded border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50")}
        >
          Remove
        </button>
      {/if}
      <button
        onclick={save}
        disabled={submitting}
        class={cn("text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 ml-auto")}
      >
        {submitting ? "Saving…" : existingRule ? "Update" : "Create"}
      </button>
    </div>
  </div>
{/if}
