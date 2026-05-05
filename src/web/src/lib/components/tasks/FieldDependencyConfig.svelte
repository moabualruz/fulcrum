<script lang="ts">
  /**
   * FieldDependencyConfig — Phase 05 Plan 12 (D-110).
   *
   * Admin UI for managing field dependency rules per project.
   * CRUD via tRPC fieldDependencies router (wired or stubbed).
   */
  import { cn } from "$lib/utils.js";

  interface Rule {
    id: string;
    sourceFieldId: string;
    sourceValue: string;
    targetFieldId: string;
    action: string;
  }

  interface Props {
    projectId: string;
    orgId: string;
  }

  let { projectId, orgId }: Props = $props();

  let rules = $state<Rule[]>([]);
  let loading = $state(false);
  let saveError = $state("");

  // New rule form state
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
      const res = await fetch(
        "/api/trpc/fieldDependencies.list?input=" +
          encodeURIComponent(JSON.stringify({ projectId, orgId }))
      );
      if (res.ok) {
        const json = await res.json() as { result?: { data?: Rule[] } };
        rules = json.result?.data ?? [];
      }
    } catch { /* best-effort */ }
    finally { loading = false; }
  }

  async function addRule() {
    if (!newSourceField || !newSourceValue || !newTargetField) return;
    adding = true;
    saveError = "";
    try {
      const res = await fetch("/api/trpc/fieldDependencies.create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "0": {
            json: {
              projectId,
              orgId,
              sourceFieldId: newSourceField,
              sourceValue: newSourceValue,
              targetFieldId: newTargetField,
              action: newAction,
            },
          },
        }),
      });
      if (!res.ok) {
        saveError = "Failed to add rule.";
      } else {
        newSourceField = "";
        newSourceValue = "";
        newTargetField = "";
        newAction = "require";
        await loadRules();
      }
    } catch {
      saveError = "Network error.";
    } finally {
      adding = false;
    }
  }

  async function deleteRule(ruleId: string) {
    try {
      const res = await fetch("/api/trpc/fieldDependencies.delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "0": { json: { ruleId, orgId } } }),
      });
      if (res.ok) {
        rules = rules.filter((r) => r.id !== ruleId);
      }
    } catch { /* best-effort */ }
  }

  // Load on mount
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

  <!-- Add rule form -->
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
