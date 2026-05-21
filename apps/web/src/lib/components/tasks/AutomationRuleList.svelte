<script lang="ts">
  /**
   * AutomationRuleList — CRUD UI for project automation rules.
   */
  import { onMount } from "svelte";
  import { cn } from "$lib/utils.js";
  import {
    createAutomationRule,
    deleteAutomationRule,
    listAutomationRules,
    listAutomationTemplates,
    updateAutomationRule,
    type AutomationRule,
    type AutomationTemplate,
  } from "./automation-api";

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

  interface Props {
    projectId: string;
    orgId?: string;
    currentUserId?: string;
  }

  let { projectId, orgId = "", currentUserId = "" }: Props = $props();

  // ── State ────────────────────────────────────────────────────────────────────

  let rules = $state<AutomationRule[]>([]);
  let templates = $state<AutomationTemplate[]>([]);
  let loading = $state(true);
  let error = $state("");
  let showAddForm = $state(false);
  let showTemplates = $state(false);
  let deletingId = $state<string | null>(null);
  let confirmDeleteId = $state<string | null>(null);
  let ruleSearch = $state("");

  // New rule form state
  let newName = $state("");
  let newTrigger = $state<TriggerType>("status_change");
  let newAction = $state<ActionType>("set_status");
  let newActionValue = $state("");
  let conditionField = $state("");
  let conditionOperator = $state("equals");
  let conditionValue = $state("");
  let useCondition = $state(false);
  let submitting = $state(false);

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

  const visibleRules = $derived(ruleSearch.trim()
    ? rules.filter((rule) => {
        const needle = ruleSearch.trim().toLowerCase();
        return [
          rule.name,
          triggerLabel(rule.triggerType),
          actionLabel(rule.actionType),
          rule.enabled ? "enabled" : "disabled",
        ].some((value) => value.toLowerCase().includes(needle));
      })
    : rules);

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  onMount(async () => {
    await load();
  });

  async function load() {
    loading = true;
    error = "";
    try {
      rules = await listAutomationRules(fetch, { orgId, userId: currentUserId, projectId });
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to load automations";
    } finally {
      loading = false;
    }
  }

  async function loadTemplates() {
    try {
      templates = await listAutomationTemplates(fetch, { orgId, userId: currentUserId });
      showTemplates = true;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to load templates";
    }
  }

  async function toggleEnabled(rule: AutomationRule) {
    try {
      const updated = await updateAutomationRule(fetch, { orgId, userId: currentUserId }, { id: rule.id, enabled: !rule.enabled });
      rules = rules.map((r) => (r.id === rule.id ? updated : r));
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to update rule";
    }
  }

  async function deleteRule(id: string) {
    deletingId = id;
    try {
      await deleteAutomationRule(fetch, { orgId, userId: currentUserId }, { id });
      rules = rules.filter((r) => r.id !== id);
      confirmDeleteId = null;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to delete rule";
    } finally {
      deletingId = null;
    }
  }

  async function createFromTemplate(tpl: AutomationTemplate) {
    submitting = true;
    try {
      const created = await createAutomationRule(fetch, { orgId, userId: currentUserId, projectId }, {
        name: tpl.name,
        triggerType: tpl.triggerType,
        triggerConfig: tpl.triggerConfig,
        actionType: tpl.actionType,
        actionConfig: tpl.actionConfig,
        condition: tpl.condition ?? null,
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
    if (!newName.trim()) return;
    submitting = true;
    error = "";
    try {
      const condition = useCondition && conditionField
        ? { field: conditionField, operator: conditionOperator, value: conditionValue }
        : null;
      const created = await createAutomationRule(fetch, { orgId, userId: currentUserId, projectId }, {
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
    conditionOperator = "equals";
    conditionValue = "";
  }

  function triggerLabel(triggerType: string): string {
    return TRIGGER_LABELS[triggerType as TriggerType] ?? humanizeToken(triggerType);
  }

  function actionLabel(actionType: string): string {
    return ACTION_LABELS[actionType as ActionType] ?? humanizeToken(actionType);
  }

  function humanizeToken(value: string): string {
    return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
</script>

<div data-automation-rules data-project-id={projectId} class={cn("flex flex-col gap-4")}>
  <!-- Header -->
  <div class={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between")}>
    <div>
      <h2 class={cn("text-lg font-semibold")}>Automation rules</h2>
      <p class={cn("text-sm text-muted-foreground")}>Project {projectId}: automate repetitive actions based on project events.</p>
    </div>
    <div class={cn("flex gap-2")}>
      <button
        type="button"
        onclick={loadTemplates}
        data-automation-template-button
        class={cn("text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted")}
      >
        Use Template
      </button>
      <button
        type="button"
        onclick={() => (showAddForm = !showAddForm)}
        data-automation-new-rule
        class={cn("text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90")}
      >
        + Add Rule
      </button>
    </div>
  </div>

  <label class={cn("flex max-w-md flex-col gap-1 text-sm")}>
    <span class={cn("text-xs font-medium text-muted-foreground")}>Search rules</span>
    <input
      type="search"
      bind:value={ruleSearch}
      data-automation-rule-search
      placeholder="auto-close, status, disabled..."
      class={cn("h-9 rounded-md border border-input bg-background px-3 text-sm")}
    />
  </label>

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
            <option value="equals">equals</option>
            <option value="not_equals">not equals</option>
            <option value="contains">contains</option>
            <option value="is_empty">is empty</option>
            <option value="is_not_empty">is not empty</option>
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
      <p class={cn("text-xs mt-1")}>Add a rule or apply a template.</p>
    </div>
  {:else if visibleRules.length === 0}
    <div data-automation-rules-empty class={cn("rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground")}>
      No automation rules match "{ruleSearch}".
    </div>
  {:else}
    <div class={cn("flex flex-col gap-2")}>
      {#each visibleRules as rule}
        <div
          data-automation-rule={rule.id}
          data-automation-rule-status={rule.enabled ? "enabled" : "disabled"}
          class={cn("flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors")}
        >
          <!-- Enabled toggle -->
          <button
            type="button"
            onclick={() => toggleEnabled(rule)}
            title={rule.enabled ? "Disable rule" : "Enable rule"}
            data-automation-rule-toggle={rule.id}
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
              <span data-automation-rule-trigger={rule.id} class={cn("bg-muted px-1.5 py-0.5 rounded")}>{triggerLabel(rule.triggerType)}</span>
              <span class={cn("mx-1")}>→</span>
              <span data-automation-rule-action={rule.id} class={cn("bg-muted px-1.5 py-0.5 rounded")}>{actionLabel(rule.actionType)}</span>
              <span data-automation-rule-enabled={rule.id} class={cn("ml-1 bg-muted px-1.5 py-0.5 rounded")}>{rule.enabled ? "Enabled" : "Disabled"}</span>
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
                type="button"
                onclick={() => deleteRule(rule.id)}
                disabled={deletingId === rule.id}
                data-automation-rule-delete-confirm={rule.id}
                class={cn("text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50")}
              >
                {deletingId === rule.id ? "…" : "Yes"}
              </button>
              <button
                type="button"
                onclick={() => (confirmDeleteId = null)}
                data-automation-rule-delete-cancel={rule.id}
                class={cn("text-xs px-2 py-0.5 rounded border border-border hover:bg-muted")}
              >
                No
              </button>
            </div>
          {:else}
            <button
              type="button"
              onclick={() => (confirmDeleteId = rule.id)}
              data-automation-rule-delete={rule.id}
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
