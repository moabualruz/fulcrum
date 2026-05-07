<script lang="ts">
  /**
   * WorkflowEditor — visual transition graph editor (D-23, D-24).
   *
   * Renders status nodes in 5-category columns. Allowed transitions as directed
   * arrows. Edit mode: click status → checkbox list for target statuses.
   * Save: trpc.workflows.updateTransitions. Reset: trpc.workflows.getDefault.
   *
   * Security: T-05-33 — only project admins; permission check enforced in router.
   */
  import { onMount } from "svelte";
  import { cn } from "$lib/utils.js";

  // ── Props ────────────────────────────────────────────────────────────────────

  type Methodology = "scrum" | "kanban" | "none";

  interface Props {
    projectId: string;
    methodology?: Methodology;
    /** Injected tRPC client */
    trpc?: {
    workflows: {
      getTransitions: { query: (input: { projectId: string }) => Promise<Record<string, string[]>> };
      updateTransitions: { mutate: (input: { projectId: string; transitions: Record<string, string[]> }) => Promise<void> };
      getDefault: { query: (input: { methodology: string }) => Promise<Record<string, string[]>> };
    };
    } | null;
  }

  let { projectId, methodology = "scrum", trpc = null }: Props = $props();

  // ── State ────────────────────────────────────────────────────────────────────

  type StatusCategory = "backlog" | "unstarted" | "started" | "completed" | "canceled";

  interface StatusNode {
    id: string;
    name: string;
    category: StatusCategory;
    color?: string;
  }

  const CATEGORY_ORDER: StatusCategory[] = ["backlog", "unstarted", "started", "completed", "canceled"];
  const CATEGORY_LABELS: Record<StatusCategory, string> = {
    backlog: "Backlog",
    unstarted: "Unstarted",
    started: "In Progress",
    completed: "Completed",
    canceled: "Canceled",
  };
  const CATEGORY_COLORS: Record<StatusCategory, string> = {
    backlog: "bg-slate-100 text-slate-700 border-slate-300",
    unstarted: "bg-gray-100 text-gray-700 border-gray-300",
    started: "bg-blue-100 text-blue-700 border-blue-300",
    completed: "bg-green-100 text-green-700 border-green-300",
    canceled: "bg-red-100 text-red-700 border-red-300",
  };

  // Default statuses per category (fallback when no custom statuses configured)
  const DEFAULT_STATUSES: StatusNode[] = [
    { id: "backlog", name: "Backlog", category: "backlog" },
    { id: "todo", name: "Todo", category: "unstarted" },
    { id: "in_progress", name: "In Progress", category: "started" },
    { id: "in_review", name: "In Review", category: "started" },
    { id: "done", name: "Done", category: "completed" },
    { id: "canceled", name: "Canceled", category: "canceled" },
  ];

  let statuses: StatusNode[] = DEFAULT_STATUSES;
  let transitions: Record<string, string[]> = {};
  let editingStatus: string | null = null;
  let loading = true;
  let saving = false;
  let error = "";
  let successMsg = "";

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  onMount(async () => {
    await loadTransitions();
  });

  async function loadTransitions() {
    if (!trpc) return;
    loading = true;
    error = "";
    try {
      transitions = await trpc.workflows.getTransitions.query({ projectId });
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to load transitions";
    } finally {
      loading = false;
    }
  }

  async function save() {
    if (!trpc) return;
    saving = true;
    error = "";
    successMsg = "";
    try {
      await trpc.workflows.updateTransitions.mutate({ projectId, transitions });
      successMsg = "Workflow saved";
      editingStatus = null;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      saving = false;
    }
  }

  async function resetToDefault() {
    if (!trpc) return;
    saving = true;
    error = "";
    try {
      const defaults = await trpc.workflows.getDefault.query({ methodology });
      transitions = defaults;
      await trpc.workflows.updateTransitions.mutate({ projectId, transitions });
      successMsg = "Reset to default workflow";
      editingStatus = null;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to reset";
    } finally {
      saving = false;
    }
  }

  function toggleTransition(from: string, to: string) {
    const current = transitions[from] ?? [];
    if (current.includes(to)) {
      transitions = { ...transitions, [from]: current.filter((t) => t !== to) };
    } else {
      transitions = { ...transitions, [from]: [...current, to] };
    }
  }

  function hasTransition(from: string, to: string): boolean {
    return (transitions[from] ?? []).includes(to);
  }

  function statusesByCategory(cat: StatusCategory): StatusNode[] {
    return statuses.filter((s) => s.category === cat);
  }

  function allTargets(from: string): StatusNode[] {
    return statuses.filter((s) => s.id !== from);
  }
</script>

<div class={cn("flex flex-col gap-4")}>
  <!-- Header -->
  <div class={cn("flex items-center justify-between")}>
    <div>
      <h2 class={cn("text-lg font-semibold")}>Workflow Transitions</h2>
      <p class={cn("text-sm text-muted-foreground")}>Define which status transitions are allowed. Click a status to edit its allowed targets.</p>
    </div>
    <div class={cn("flex gap-2")}>
      <button
        onclick={resetToDefault}
        disabled={saving}
        class={cn("text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50")}
      >
        Reset to Default
      </button>
      <button
        onclick={save}
        disabled={saving || loading}
        class={cn("text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50")}
      >
        {saving ? "Saving…" : "Save Workflow"}
      </button>
    </div>
  </div>

  {#if error}
    <p class={cn("text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md")}>{error}</p>
  {/if}
  {#if successMsg}
    <p class={cn("text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md")}>{successMsg}</p>
  {/if}

  {#if loading}
    <p class={cn("text-sm text-muted-foreground")}>Loading…</p>
  {:else}
    <!-- 5-column category grid -->
    <div class={cn("grid grid-cols-5 gap-3")}>
      {#each CATEGORY_ORDER as cat}
        <div class={cn("flex flex-col gap-2")}>
          <div class={cn("text-xs font-semibold uppercase tracking-wide text-muted-foreground")}>{CATEGORY_LABELS[cat]}</div>
          {#each statusesByCategory(cat) as status}
            <button
              onclick={() => (editingStatus = editingStatus === status.id ? null : status.id)}
              class={cn(
                "px-2 py-1.5 rounded-md border text-xs font-medium text-left transition-all",
                CATEGORY_COLORS[cat],
                editingStatus === status.id && "ring-2 ring-primary ring-offset-1"
              )}
            >
              {status.name}
              {#if (transitions[status.id] ?? []).length > 0}
                <span class={cn("ml-1 text-xs opacity-60")}>→ {(transitions[status.id] ?? []).length}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/each}
    </div>

    <!-- Edit panel -->
    {#if editingStatus}
      {@const src = statuses.find((s) => s.id === editingStatus)}
      {#if src}
        <div class={cn("border border-border rounded-lg p-4 bg-muted/30")}>
          <h3 class={cn("text-sm font-semibold mb-3")}>
            Allowed transitions from <span class={cn("text-primary")}>{src.name}</span>
          </h3>
          <div class={cn("grid grid-cols-3 gap-2")}>
            {#each allTargets(src.id) as target}
              <label class={cn("flex items-center gap-2 text-sm cursor-pointer")}>
                <input
                  type="checkbox"
                  checked={hasTransition(src.id, target.id)}
                  onchange={() => toggleTransition(src.id, target.id)}
                  class={cn("rounded border-border")}
                />
                <span class={cn("px-1.5 py-0.5 rounded text-xs", CATEGORY_COLORS[target.category])}>
                  {target.name}
                </span>
              </label>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    <!-- Transition summary table -->
    <div class={cn("mt-2")}>
      <h3 class={cn("text-sm font-medium mb-2 text-muted-foreground")}>Transition Summary</h3>
      <div class={cn("border border-border rounded-lg overflow-hidden text-sm")}>
        <table class={cn("w-full")}>
          <thead class={cn("bg-muted text-xs")}>
            <tr>
              <th class={cn("px-3 py-2 text-left font-medium")}>From Status</th>
              <th class={cn("px-3 py-2 text-left font-medium")}>Allowed Targets</th>
            </tr>
          </thead>
          <tbody>
            {#each statuses as status}
              {@const targets = transitions[status.id] ?? []}
              <tr class={cn("border-t border-border hover:bg-muted/40 transition-colors")}>
                <td class={cn("px-3 py-2 font-medium")}>{status.name}</td>
                <td class={cn("px-3 py-2 text-muted-foreground")}>
                  {#if targets.length === 0}
                    <span class={cn("italic text-xs")}>No transitions (terminal)</span>
                  {:else}
                    {targets.map((t) => statuses.find((s) => s.id === t)?.name ?? t).join(", ")}
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
