<script lang="ts">
  /**
   * AutomationRuleList — CRUD UI for automation rules (D-89, D-92).
   *
   * Lists rules with enable/disable toggle and execution count.
   * Add Rule form: trigger picker, optional condition builder, action picker.
   * Templates button: 4 hardcoded templates from trpc.automations.templates.
   *
   * Security: T-05-34 — rules scoped to project; permission enforced in router.
   */
  import { onMount } from "svelte";
  import { cn } from "$lib/utils.js";

  // ── Types ────────────────────────────────────────────────────────────────────

  type TriggerType =
    | "status_change"
    | "assignee_change"
    | "label_added"
    | "priority_change"
    | "due_date_passed"
    | "task_created"
    | "comment_added";

  type ActionType =
    | "set_status"
    | "set_assignee"
    | "add_label"
    | "remove_label"
    | "set_priority"
    | "move_to_sprint"
    | "add_comment"
    | "subscribe_watcher";

  interface AutomationRule {
    id: string;
    name: string;
    triggerType: TriggerType;
    triggerConfig: Record<string, unknown>;
    actionType: ActionType;
    actionConfig: Record<string, unknown>;
    enabled: boolean;
    executionCount: number;
    condition?: { field: string; operator: string; value: string } | null;
  }

  interface AutomationTemplate {
    id: string;
    name: string;
    description: string;
    triggerType: TriggerType;
    triggerConfig: Record<string, unknown>;
    actionType: ActionType;
    actionConfig: Record<string, unknown>;
  }

  // ── Props ────────────────────────────────────────────────────────────────────

  export let projectId: string;
  export let trpc: {
    automations: {
      list: { query: (input: { projectId: string }) => Promise<AutomationRule[]> };
      create: { mutate: (input: {
        projectId: string;
        name: string;
        triggerType: TriggerType;
        triggerConfig: Record<string, unknown>;
        actionType: ActionType;
        actionConfig: Record<string, unknown>;
        condition?: { field: string; operator: string; value: string } | null;
      }) => Promise<AutomationRule> };
      update: { mutate: (input: { id: string; enabled?: boolean }) => Promise<AutomationRule> };
      delete: { mutate: (input: { id: string }) => Promise<void> };
      templates: { query: () => Promise<AutomationTemplate[]> };
    };
  } | null = null;

  // ── State ────────────────────────────────────────────────────────────────────

  let rules: AutomationRule[] = [];
  let templates: AutomationTemplate[] = [];
  let loading = true;
  let error = "";
  let showAddForm = false;
  let showTemplates = false;
  let deletingId: string | null = null;
  let confirmDeleteId: string | null = null;

  // New rule form state
  let newName = "";
  let newTrigger: TriggerType = "status_change";
  let newAction: ActionType = "set_status";
  let newActionValue = "";
  let conditionField = "";
  let conditionOperator = "eq";
  let conditionValue = "";
  let useCondition = false;
  let submitting = false;

  const TRIGGER_LABELS: Record<TriggerType, string> = {
    status_change: "Status changes",
    assignee_change: "Assignee changes",
    label_added: "Label added",
    priority_change: "Priority changes",
    due_date_passed: "Due date passed",
    task_created: "Task created",
    comment_added: "Comment added",
  };

  const ACTION_LABELS: Record<ActionType, string> = {
    set_status: "Set status",
    set_assignee: "Set assignee",
    add_label: "Add label",
    remove_label: "Remove label",
    set_priority: "Set priority",
    move_to_sprint: "Move to sprint",
    add_comment: "Add comment",
    subscribe_watcher: "Subscribe watcher",
  };

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  onMount(async () => {
    await load();
  });

  async function load() {
    if (!trpc) return;
    loading = true;
    error = "";
    try {
      rules = await trpc.automations.list.query({ projectId });
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to load automations";
    } finally {
      loading = false;
    }
  }

  async function loadTemplates() {
    if (!trpc) return;
    try {
      templates = await trpc.automations.templates.query();
      showTemplates = true;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to load templates";
    }
  }

  async function toggleEnabled(rule: AutomationRule) {
    if (!trpc) return;
    try {
      const updated = await trpc.automations.update.mutate({ id: rule.id, enabled: !rule.enabled });
      rules = rules.map((r) => (r.id === rule.id ? updated : r));
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to update rule";
    }
  }

  async function deleteRule(id: string) {
    if (!trpc) return;
    deletingId = id;
    try {
      await trpc.automations.delete.mutate({ id });
      rules = rules.filter((r) => r.id !== id);
      confirmDeleteId = null;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to delete rule";
    } finally {
      deletingId = null;
    }
  }

  async function createFromTemplate(tpl: AutomationTemplate) {
    if (!trpc) return;
    submitting = true;
    try {
      const created = await trpc.automations.create.mutate({
        projectId,
        name: tpl.name,
        triggerType: tpl.triggerType,
        triggerConfig: tpl.triggerConfig,
        actionType: tpl.actionType,
        actionConfig: tpl.actionConfig,
      });
      rules = [...rules, created];
      showTemplates = false;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to create from template";
    } finally {
      submitting = false;
    }
  }

  async function submitNewRule() {
    if (!trpc || !newName.trim()) return;
    submitting = true;
    error = "";
    try {
      const condition = useCondition && conditionField
        ? { field: conditionField, operator: conditionOperator, value: conditionValue }
        : null;
      const created = await trpc.automations.create.mutate({
        projectId,
        name: newName.trim(),
        triggerType: newTrigger,
        triggerConfig: {},
        actionType: newAction,
        actionConfig: newActionValue ? { value: newActionValue } : {},
        condition,
      });
      rules = [...rules, created];
      resetForm();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to create rule";
    } finally {
      submitting = false;
    }
  }

  function resetForm() {
    showAddForm = false;
    newName = "";
    newTrigger = "status_change";
    newAction = "set_status";
    newActionValue = "";
    useCondition = false;
    conditionField = "";
    conditionOperator = "eq";
    conditionValue = "";
  }
</script>

<div class={cn("flex flex-col gap-4")}>
  <!-- Header -->
  <div class={cn("flex items-center justify-between")}>
    <div>
      <h2 class={cn("text-lg font-semibold")}>Automation Rules</h2>
      <p class={cn("text-sm text-muted-foreground")}>Automate repetitive actions based on project events.</p>
    </div>
    <div class={cn("flex gap-2")}>
      <button
        onclick={loadTemplates}
        class={cn("text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted")}
      >
        Use Template
      </button>
      <button
        onclick={() => (showAddForm = !showAddForm)}
        class={cn("text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90")}
      >
        + Add Rule
      </button>
    </div>
  </div>

  {#if error}
    <p class={cn("text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md")}>{error}</p>
  {/if}

  <!-- Add Rule Form -->
  {#if showAddForm}
    <div class={cn("border border-border rounded-lg p-4 bg-muted/20 flex flex-col gap-3")}>
      <h3 class={cn("text-sm font-semibold")}>New Automation Rule</h3>

      <div class={cn("flex flex-col gap-1")}>
        <label class={cn("text-xs font-medium")}>Rule Name</label>
        <input
          bind:value={newName}
          placeholder="e.g. Auto-assign on task created"
          class={cn("h-8 rounded-md border border-input px-2 text-sm bg-background")}
        />
      </div>

      <div class={cn("grid grid-cols-2 gap-3")}>
        <div class={cn("flex flex-col gap-1")}>
          <label class={cn("text-xs font-medium")}>Trigger</label>
          <select bind:value={newTrigger} class={cn("h-8 rounded-md border border-input px-2 text-sm bg-background")}>
            {#each Object.entries(TRIGGER_LABELS) as [val, label]}
              <option value={val}>{label}</option>
            {/each}
          </select>
        </div>
        <div class={cn("flex flex-col gap-1")}>
          <label class={cn("text-xs font-medium")}>Action</label>
          <select bind:value={newAction} class={cn("h-8 rounded-md border border-input px-2 text-sm bg-background")}>
            {#each Object.entries(ACTION_LABELS) as [val, label]}
              <option value={val}>{label}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class={cn("flex flex-col gap-1")}>
        <label class={cn("text-xs font-medium")}>Action Value</label>
        <input
          bind:value={newActionValue}
          placeholder="e.g. status name, assignee ID, label name"
          class={cn("h-8 rounded-md border border-input px-2 text-sm bg-background")}
        />
      </div>

      <!-- Optional condition -->
      <label class={cn("flex items-center gap-2 text-sm cursor-pointer")}>
        <input type="checkbox" bind:checked={useCondition} class={cn("rounded")} />
        Add condition
      </label>

      {#if useCondition}
        <div class={cn("grid grid-cols-3 gap-2")}>
          <input bind:value={conditionField} placeholder="field" class={cn("h-8 rounded-md border border-input px-2 text-sm bg-background")} />
          <select bind:value={conditionOperator} class={cn("h-8 rounded-md border border-input px-2 text-sm bg-background")}>
            <option value="eq">equals</option>
            <option value="neq">not equals</option>
            <option value="contains">contains</option>
            <option value="gt">greater than</option>
            <option value="lt">less than</option>
          </select>
          <input bind:value={conditionValue} placeholder="value" class={cn("h-8 rounded-md border border-input px-2 text-sm bg-background")} />
        </div>
      {/if}

      <div class={cn("flex gap-2 justify-end")}>
        <button onclick={resetForm} class={cn("text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted")}>Cancel</button>
        <button
          onclick={submitNewRule}
          disabled={submitting || !newName.trim()}
          class={cn("text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50")}
        >
          {submitting ? "Creating…" : "Create Rule"}
        </button>
      </div>
    </div>
  {/if}

  <!-- Templates modal -->
  {#if showTemplates}
    <div class={cn("border border-border rounded-lg p-4 bg-background")}>
      <div class={cn("flex items-center justify-between mb-3")}>
        <h3 class={cn("text-sm font-semibold")}>Automation Templates</h3>
        <button onclick={() => (showTemplates = false)} class={cn("text-xs text-muted-foreground hover:text-foreground")}>✕ Close</button>
      </div>
      <div class={cn("flex flex-col gap-2")}>
        {#each templates as tpl}
          <div class={cn("flex items-start justify-between p-3 rounded-md border border-border hover:bg-muted/40")}>
            <div>
              <div class={cn("text-sm font-medium")}>{tpl.name}</div>
              <div class={cn("text-xs text-muted-foreground")}>{tpl.description}</div>
            </div>
            <button
              onclick={() => createFromTemplate(tpl)}
              disabled={submitting}
              class={cn("text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 ml-3 shrink-0")}
            >
              Use
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Rules list -->
  {#if loading}
    <p class={cn("text-sm text-muted-foreground")}>Loading…</p>
  {:else if rules.length === 0}
    <div class={cn("text-center py-12 text-muted-foreground")}>
      <p class={cn("text-sm")}>No automation rules yet.</p>
      <p class={cn("text-xs mt-1")}>Add a rule or use a template to get started.</p>
    </div>
  {:else}
    <div class={cn("flex flex-col gap-2")}>
      {#each rules as rule}
        <div class={cn("flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors")}>
          <!-- Enabled toggle -->
          <button
            onclick={() => toggleEnabled(rule)}
            title={rule.enabled ? "Disable rule" : "Enable rule"}
            class={cn(
              "mt-0.5 relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              rule.enabled ? "bg-primary" : "bg-muted-foreground/30"
            )}
            role="switch"
            aria-checked={rule.enabled}
          >
            <span
              class={cn(
                "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition",
                rule.enabled ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>

          <!-- Rule details -->
          <div class={cn("flex-1 min-w-0")}>
            <div class={cn("text-sm font-medium truncate")}>{rule.name}</div>
            <div class={cn("text-xs text-muted-foreground mt-0.5")}>
              <span class={cn("bg-muted px-1.5 py-0.5 rounded")}>{TRIGGER_LABELS[rule.triggerType]}</span>
              <span class={cn("mx-1")}>→</span>
              <span class={cn("bg-muted px-1.5 py-0.5 rounded")}>{ACTION_LABELS[rule.actionType]}</span>
            </div>
            {#if rule.executionCount > 0}
              <div class={cn("text-xs text-muted-foreground mt-1")}>
                Executed {rule.executionCount} time{rule.executionCount === 1 ? "" : "s"}
              </div>
            {/if}
          </div>

          <!-- Delete -->
          {#if confirmDeleteId === rule.id}
            <div class={cn("flex gap-1 items-center")}>
              <span class={cn("text-xs text-destructive")}>Delete?</span>
              <button
                onclick={() => deleteRule(rule.id)}
                disabled={deletingId === rule.id}
                class={cn("text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50")}
              >
                {deletingId === rule.id ? "…" : "Yes"}
              </button>
              <button
                onclick={() => (confirmDeleteId = null)}
                class={cn("text-xs px-2 py-0.5 rounded border border-border hover:bg-muted")}
              >
                No
              </button>
            </div>
          {:else}
            <button
              onclick={() => (confirmDeleteId = rule.id)}
              class={cn("text-xs text-muted-foreground hover:text-destructive transition-colors")}
            >
              Delete
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
