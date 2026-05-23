<script lang="ts">
  import { } from "./field-dependency-api.js";
  import { cn, createFieldDependencyRule, deleteFieldDependencyRule, listFieldDependencyRules, Select, type FieldDependencyRule } from "@fulcrum/ui-kit";

  interface Props {
    projectId: string;
    orgId: string;
    userId: string;
  }

  let { projectId, orgId, userId }: Props = $props();

  let rules = $state<FieldDependencyRule[]>([]);
  let loading = $state(false);
  let saveError = $state("");

  let newSourceField = $state("");
  let newSourceValue = $state("");
  let newTargetField = $state("");
  let newAction = $state<"show" | "hide" | "require">("require");
  let adding = $state(false);

  const ACTION_LABELS: Record<string, string> = {
    show: "Show",
    hide: "Hide",
    require: "Require",
  };

  async function loadRules() {
    loading = true;
    try {
      rules = await listFieldDependencyRules(fetch, { orgId, userId, projectId });
    } catch {
      rules = [];
    }
    finally { loading = false; }
  }

  async function addRule() {
    if (!newSourceField || !newSourceValue || !newTargetField) return;
    adding = true;
    saveError = "";
    try {
      await createFieldDependencyRule(fetch, { orgId, userId, projectId }, {
        sourceFieldId: newSourceField,
        sourceValue: newSourceValue,
        targetFieldId: newTargetField,
        action: newAction,
      });
      newSourceField = "";
      newSourceValue = "";
      newTargetField = "";
      newAction = "require";
      await loadRules();
    } catch {
      saveError = "Failed to add rule.";
    } finally {
      adding = false;
    }
  }

  async function deleteRule(ruleId: string) {
    try {
      await deleteFieldDependencyRule(fetch, { orgId, userId }, ruleId);
      rules = rules.filter((r) => r.id !== ruleId);
    } catch {
      saveError = "Failed to delete rule.";
    }
  }

  $effect(() => {
    void loadRules();
  });
</script>

<div class={cn("rounded-lg border border-border bg-card p-4")}>
  <h3 class="mb-4 text-sm font-semibold">Field Dependency Rules</h3>

  {#if loading}
    <p class="text-xs text-muted-foreground">Loading rules…</p>
  {:else if rules.length === 0}
    <p class="mb-4 text-xs text-muted-foreground">No rules configured. Add one below.</p>
  {:else}
    <ul class="mb-4 space-y-2">
      {#each rules as rule (rule.id)}
        <li class={cn("flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs")}>
          <span>
            When <strong>{rule.sourceFieldId}</strong> = <code class="rounded bg-muted px-1">{rule.sourceValue}</code>
            &rarr;
            <span class="text-primary">{ACTION_LABELS[rule.action] ?? rule.action}</span>
            <strong>{rule.targetFieldId}</strong>
          </span>
          <button
            type="button"
            onclick={() => void deleteRule(rule.id)}
            aria-label="Delete rule"
            class={cn("text-destructive hover:underline")}
          >
            Delete
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <form
    onsubmit={(e) => { e.preventDefault(); void addRule(); }}
    class="flex flex-col gap-2"
  >
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div class="flex flex-col gap-1">
        <label for="fdc-source-field" class="text-xs text-muted-foreground">Source field</label>
        <input
          id="fdc-source-field"
          type="text"
          bind:value={newSourceField}
          placeholder="e.g. type"
          required
          class={cn(
            "rounded border border-border bg-background px-2 py-1 text-xs",
            "focus:outline-none focus:ring-1 focus:ring-ring",
          )}
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="fdc-source-value" class="text-xs text-muted-foreground">Source value</label>
        <input
          id="fdc-source-value"
          type="text"
          bind:value={newSourceValue}
          placeholder="e.g. bug"
          required
          class={cn(
            "rounded border border-border bg-background px-2 py-1 text-xs",
            "focus:outline-none focus:ring-1 focus:ring-ring",
          )}
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="fdc-target-field" class="text-xs text-muted-foreground">Target field</label>
        <input
          id="fdc-target-field"
          type="text"
          bind:value={newTargetField}
          placeholder="e.g. severity"
          required
          class={cn(
            "rounded border border-border bg-background px-2 py-1 text-xs",
            "focus:outline-none focus:ring-1 focus:ring-ring",
          )}
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="fdc-action" class="text-xs text-muted-foreground">Action</label>
        <select
          id="fdc-action"
          bind:value={newAction}
          class={cn(
            "rounded border border-border bg-background px-2 py-1 text-xs",
            "focus:outline-none focus:ring-1 focus:ring-ring",
          )}
        >
          <option value="require">Require</option>
          <option value="show">Show</option>
          <option value="hide">Hide</option>
        </select>
      </div>
    </div>

    {#if saveError}
      <p class="text-xs text-destructive" role="alert">{saveError}</p>
    {/if}

    <button
      type="submit"
      disabled={adding || !newSourceField || !newSourceValue || !newTargetField}
      class={cn(
        "self-start rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground",
        "hover:bg-primary/90 disabled:opacity-50",
      )}
    >
      {adding ? "Adding…" : "Add rule"}
    </button>
  </form>
</div>
