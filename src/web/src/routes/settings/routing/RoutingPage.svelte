<script lang="ts">
  import type { RoutingDecisionRow, RoutingRuleRow } from "./routing.types";

  interface Props {
    data: {
      projectId: string | null;
      rules: RoutingRuleRow[];
      inheritedRules: RoutingRuleRow[];
      activeProjectId?: string | null;
    };
    form?: {
      createError?: string;
      updateError?: string;
      dryRunError?: string;
      dryRunResult?: RoutingDecisionRow | null;
    };
  }

  let { data, form }: Props = $props();
  const rules = $derived(data.rules ?? []);
  const inheritedRules = $derived(data.inheritedRules ?? []);
  const allVisibleRules = $derived([...rules, ...inheritedRules]);
  const dryRunRule = $derived(allVisibleRules.find((rule) => rule.id === form?.dryRunResult?.ruleId));
  const defaultConditionsJson = JSON.stringify({ all: [{ fact: "task.kind", operator: "equal", value: "bug" }] });
  const defaultTaskJson = JSON.stringify({ title: "Fix bug", kind: "bug", priority: "high", tags: [] });
</script>

<svelte:head>
  <title>Routing Rules | Fulcrum Settings</title>
</svelte:head>

<div data-routing-settings class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
  <header class="flex flex-col gap-2">
    <h1 class="text-2xl font-semibold tracking-tight">Routing Rules</h1>
    <p class="text-sm text-muted-foreground">Manage deterministic task-to-agent routing rules.</p>
  </header>

  {#if form?.createError}
    <p data-routing-create-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.createError}
    </p>
  {/if}
  {#if form?.updateError}
    <p data-routing-update-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.updateError}
    </p>
  {/if}

  <details data-routing-create-panel class="rounded-md border border-border p-4" open={rules.length === 0}>
    <summary class="cursor-pointer text-sm font-medium">
      <button type="button" class="pointer-events-none rounded-md border border-border px-3 py-1.5 text-sm">New rule</button>
    </summary>
    <form method="POST" action="?/create" class="mt-4 grid gap-3 md:grid-cols-2">
      <input type="hidden" name="enabled" value="true" />
      <label class="grid gap-1 text-sm">
        Rule name
        <input name="name" aria-label="Rule name" class="rounded-md border border-input bg-background px-3 py-2" required />
      </label>
      <label class="grid gap-1 text-sm">
        Agent
        <input name="actionAgent" aria-label="Agent" class="rounded-md border border-input bg-background px-3 py-2" required />
      </label>
      <label class="grid gap-1 text-sm">
        Skill set
        <input name="actionSkillSet" aria-label="Skill set" class="rounded-md border border-input bg-background px-3 py-2" />
      </label>
      <label class="grid gap-1 text-sm">
        Priority
        <input name="priority" aria-label="Priority" type="number" value="100" class="rounded-md border border-input bg-background px-3 py-2" />
      </label>
      <label class="grid gap-1 text-sm md:col-span-2">
        Conditions JSON
        <textarea
          name="conditionsJson"
          aria-label="Conditions JSON"
          rows="5"
          class="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
        >{defaultConditionsJson}</textarea>
      </label>
      <div class="md:col-span-2">
        <button type="submit" class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Create rule</button>
      </div>
    </form>
  </details>

  <section aria-label="Routing rules" class="overflow-x-auto rounded-md border border-border">
    <table data-routing-rules-table class="w-full min-w-[900px] text-sm">
      <thead class="border-b border-border bg-muted/50">
        <tr>
          <th class="px-4 py-2 text-left font-medium">Priority</th>
          <th class="px-4 py-2 text-left font-medium">Name</th>
          <th class="px-4 py-2 text-left font-medium">Agent</th>
          <th class="px-4 py-2 text-left font-medium">Scope</th>
          <th class="px-4 py-2 text-left font-medium">Source</th>
          <th class="px-4 py-2 text-left font-medium">Enabled</th>
          <th class="px-4 py-2 text-left font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each rules as rule, index (rule.id)}
          <tr data-routing-rule={rule.id} draggable="true" class="border-b border-border last:border-0">
            <td class="px-4 py-3">{rule.priority}</td>
            <td class="px-4 py-3 font-medium">{rule.name}</td>
            <td class="px-4 py-3">{rule.actionAgent}</td>
            <td class="px-4 py-3">{rule.projectId ? "project" : "global"}</td>
            <td class="px-4 py-3">{rule.source}</td>
            <td class="px-4 py-3">
              <form method="POST" action="?/toggle">
                <input type="hidden" name="id" value={rule.id} />
                <input type="hidden" name="enabled" value={rule.enabled ? "false" : "true"} />
                <button
                  type="submit"
                  role="switch"
                  aria-checked={rule.enabled}
                  aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                  data-routing-enabled-toggle={rule.id}
                  class="rounded-md border border-border px-2 py-1"
                >{rule.enabled ? "On" : "Off"}</button>
              </form>
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-2">
                <details>
                  <summary class="cursor-pointer rounded-md border border-border px-2 py-1">Edit</summary>
                  <form method="POST" action="?/update" class="mt-2 grid min-w-72 gap-2">
                    <input type="hidden" name="id" value={rule.id} />
                    <input name="name" aria-label={`Edit name ${rule.name}`} value={rule.name} class="rounded-md border border-input px-2 py-1" />
                    <input name="actionAgent" aria-label={`Edit agent ${rule.name}`} value={rule.actionAgent} class="rounded-md border border-input px-2 py-1" />
                    <textarea name="conditionsJson" aria-label={`Edit conditions ${rule.name}`} class="rounded-md border border-input px-2 py-1 font-mono text-xs">{JSON.stringify(rule.conditionsJson)}</textarea>
                    <button type="submit" class="rounded-md border border-border px-2 py-1">Save</button>
                  </form>
                </details>
                <form method="POST" action="?/reorder">
                  <input type="hidden" name="orderedIds" value={[rule.id, ...rules.filter((candidate) => candidate.id !== rule.id).map((candidate) => candidate.id)].join(",")} />
                  <button type="submit" data-routing-reorder-up disabled={index === 0} class="rounded-md border border-border px-2 py-1">Move up</button>
                </form>
                <form method="POST" action="?/reorder">
                  <input type="hidden" name="orderedIds" value={[...rules.filter((candidate) => candidate.id !== rule.id).map((candidate) => candidate.id), rule.id].join(",")} />
                  <button type="submit" data-routing-reorder-down disabled={index === rules.length - 1} class="rounded-md border border-border px-2 py-1">Move down</button>
                </form>
                <form method="POST" action="?/delete">
                  <input type="hidden" name="id" value={rule.id} />
                  <button type="submit" data-routing-delete={rule.id} class="rounded-md border border-destructive/50 px-2 py-1 text-destructive">Delete</button>
                </form>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  {#if inheritedRules.length > 0}
    <section aria-label="Inherited global rules" class="rounded-md border border-border p-4">
      <h2 class="text-base font-semibold">Inherited global rules</h2>
      <div class="mt-3 grid gap-2">
        {#each inheritedRules as rule (rule.id)}
          <div data-routing-inherited={rule.id} class="grid gap-1 rounded-md border border-border px-3 py-2 text-sm md:grid-cols-5">
            <span class="font-medium">{rule.name}</span>
            <span>{rule.actionAgent}</span>
            <span>global</span>
            <span>{rule.source}</span>
            <span>read-only</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section aria-label="Test routing" class="rounded-md border border-border p-4">
    <h2 class="text-base font-semibold">Test routing</h2>
    {#if form?.dryRunError}
      <p data-routing-dry-run-error class="mt-2 text-sm text-destructive">{form.dryRunError}</p>
    {/if}
    {#if form?.dryRunResult}
      <p data-routing-dry-run-result class="mt-2 text-sm">
        {#if dryRunRule}
          {dryRunRule.name} -&gt; {form.dryRunResult.agent}
        {:else if form.dryRunResult.ruleId}
          {form.dryRunResult.ruleId} -&gt; {form.dryRunResult.agent}
        {:else}
          no match
        {/if}
      </p>
    {/if}
    <form method="POST" action="?/dryRun" class="mt-3 grid gap-3">
      <label class="grid gap-1 text-sm">
        Task JSON
        <textarea
          name="taskJson"
          aria-label="Task JSON"
          rows="5"
          class="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
        >{defaultTaskJson}</textarea>
      </label>
      <button type="submit" class="w-fit rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Test routing</button>
    </form>
  </section>
</div>
