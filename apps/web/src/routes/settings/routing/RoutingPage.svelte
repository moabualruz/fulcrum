<script lang="ts">
  import { page } from "$app/state";
  import {
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Switch,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Textarea,
  } from "@fulcrum/ui-kit";
  import type { DraftRow, EnrichedDecisionRow, LlmGateConfig, RoutingDecisionRow, RoutingRuleRow } from "./routing.types";

  interface Props {
    data: {
      projectId: string | null;
      rules: RoutingRuleRow[];
      inheritedRules: RoutingRuleRow[];
      activeProjectId?: string | null;
      drafts: DraftRow[];
      llmGateConfig: LlmGateConfig | null;
      lastTestResult?: EnrichedDecisionRow | null;
    };
    form?: {
      createError?: string;
      updateError?: string;
      dryRunError?: string;
      dryRunResult?: RoutingDecisionRow | null;
      testError?: string;
      testResult?: EnrichedDecisionRow | null;
      draftError?: string;
      llmGateError?: string;
    };
  }

  let { data, form }: Props = $props();
  const rules = $derived(data.rules ?? []);
  const inheritedRules = $derived(data.inheritedRules ?? []);
  const allVisibleRules = $derived([...rules, ...inheritedRules]);
  const dryRunRule = $derived(allVisibleRules.find((rule) => rule.id === form?.dryRunResult?.ruleId));
  const defaultConditionsJson = JSON.stringify({ all: [{ fact: "task", path: "$.kind", operator: "equal", value: "bug" }] });
  const defaultTaskJson = JSON.stringify({ title: "Fix bug", kind: "bug", priority: "high", tags: [] });

  type RoutingTab = "rules" | "drafts" | "test" | "llm-gate" | "evidence";
  function parseTab(value: string | null): RoutingTab {
    return value === "drafts" || value === "test" || value === "llm-gate" || value === "evidence" ? value : "rules";
  }

  let activeTab = $state<RoutingTab>(parseTab(page.url.searchParams.get("tab")));
  let editorMode = $state<"builder" | "raw">("builder");

  // LLM gate form initial state (read once from props)
  let llmEnabled = $state(data.llmGateConfig?.enabled ?? false);
  let llmInputMode = $state(data.llmGateConfig?.inputMode ?? "full_context");

  // Enriched test output from form
  let enrichedResult = $state<EnrichedDecisionRow | null>(null);
  $effect(() => {
    enrichedResult = form?.testResult ?? null;
  });

  $effect(() => {
    activeTab = parseTab(page.url.searchParams.get("tab"));
  });
</script>

<svelte:head>
  <title>Routing Rules | Fulcrum Settings</title>
</svelte:head>

<div data-routing-settings class="mx-auto flex min-w-0 max-w-6xl flex-col gap-6 overflow-x-hidden px-4 py-8">
  <header class="flex flex-col gap-2">
    <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
      <h1 class="text-2xl font-semibold tracking-tight">Routing Rules</h1>
      {#if data.projectId}
        <Badge data-routing-project-scope variant="outline" class="w-fit">Project scope</Badge>
      {:else}
        <Badge data-routing-global-scope variant="outline" class="w-fit">Global scope</Badge>
      {/if}
    </div>
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
  {#if form?.testError}
    <p data-routing-test-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.testError}
    </p>
  {/if}
  {#if form?.draftError}
    <p data-routing-draft-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.draftError}
    </p>
  {/if}
  {#if form?.llmGateError}
    <p data-routing-llm-gate-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.llmGateError}
    </p>
  {/if}

  <Tabs bind:value={activeTab}>
    <TabsList data-routing-tabs class="max-w-full overflow-x-auto">
      <TabsTrigger value="rules" data-tab="rules" data-routing-rules-tab={activeTab === "rules" ? "true" : undefined}>Rules</TabsTrigger>
      <TabsTrigger value="drafts" data-tab="drafts">Drafts</TabsTrigger>
      <TabsTrigger value="test" data-tab="test">Test</TabsTrigger>
      <TabsTrigger value="llm-gate" data-tab="llm-gate">LLM Gate</TabsTrigger>
      <TabsTrigger value="evidence" data-tab="evidence">Evidence</TabsTrigger>
    </TabsList>
  </Tabs>

  <!-- ==================== RULES TAB ==================== -->
  {#if activeTab === "rules"}
    <div data-routing-rules-tab>
      <header class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap items-center gap-3">
          <p class="text-sm text-muted-foreground">{rules.length} rule{rules.length !== 1 ? "s" : ""}</p>
          <div class="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
            <Button
              type="button"
              variant={editorMode === "builder" ? "primary" : "ghost"}
              size="xs"
              onclick={() => (editorMode = "builder")}
            >Builder</Button>
            <Button
              type="button"
              variant={editorMode === "raw" ? "primary" : "ghost"}
              size="xs"
              onclick={() => (editorMode = "raw")}
            >Raw JSON</Button>
          </div>
        </div>
        <details data-routing-create-panel class="rounded-md border border-border p-2" open={rules.length === 0}>
          <summary class="cursor-pointer text-sm font-medium">
            <Button type="button" class="pointer-events-none" variant="outline">New rule</Button>
          </summary>
          <form method="POST" action="?/create" class="mt-4 grid gap-3 md:grid-cols-2">
              <Input type="hidden" name="enabled" value="true" />
            <label class="grid gap-1 text-sm">
              Rule name
              <Input name="name" aria-label="Rule name" required />
            </label>
            <label class="grid gap-1 text-sm">
              Agent
              <Input name="actionAgent" aria-label="Agent" required />
            </label>
            <label class="grid gap-1 text-sm">
              Skill set
              <Input name="actionSkillSet" aria-label="Skill set" />
            </label>
            <label class="grid gap-1 text-sm">
              Priority
              <Input name="priority" aria-label="Priority" type="number" value="100" />
            </label>
            <label class="grid gap-1 text-sm md:col-span-2">
              Conditions JSON
              <Textarea
                name="conditionsJson"
                aria-label="Conditions JSON"
                rows="5"
                class="font-mono text-xs"
              >{defaultConditionsJson}</Textarea>
            </label>
            <div class="md:col-span-2">
              <Button type="submit">Save rule</Button>
            </div>
          </form>
        </details>
      </header>

      <section aria-label="Routing rules" class="mt-4 overflow-x-auto rounded-md border border-border">
        <table data-routing-rules-table class="w-full min-w-[960px] text-sm">
          <thead class="border-b border-border bg-muted/50">
            <tr>
              <th class="px-4 py-2 text-left font-medium">Priority</th>
              <th class="px-4 py-2 text-left font-medium">Name</th>
              <th class="px-4 py-2 text-left font-medium">Scope</th>
              <th class="px-4 py-2 text-left font-medium">Source</th>
              <th class="px-4 py-2 text-left font-medium">Conditions</th>
              <th class="px-4 py-2 text-left font-medium">Agent</th>
              <th class="px-4 py-2 text-left font-medium">Skill set</th>
              <th class="px-4 py-2 text-left font-medium">Status</th>
              <th class="px-4 py-2 text-left font-medium">Updated</th>
              <th class="px-4 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each rules as rule, index (rule.id)}
              <tr data-routing-rule={rule.id} draggable="true" class="border-b border-border last:border-0">
                <td class="px-4 py-3">{rule.priority}</td>
                <td class="px-4 py-3 font-medium">{rule.name}</td>
                <td class="px-4 py-3">{rule.projectId ? "project" : "global"}</td>
                <td class="px-4 py-3">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-xs">{rule.source}</span>
                </td>
                <td class="max-w-[160px] truncate px-4 py-3 font-mono text-xs">{JSON.stringify(rule.conditionsJson)}</td>
                <td class="px-4 py-3">{rule.actionAgent}</td>
                <td class="px-4 py-3">
                  {#if rule.actionSkillSet.length > 0}
                    {rule.actionSkillSet.join(", ")}
                  {:else}
                    <span class="text-muted-foreground">-</span>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  {#if rule.enabled}
                    <Badge data-routing-enabled-toggle={rule.id} variant="success">Enabled</Badge>
                  {:else}
                    <Badge data-routing-enabled-toggle={rule.id} variant="default">Disabled</Badge>
                  {/if}
                </td>
                <td class="px-4 py-3 text-xs text-muted-foreground">
                  {typeof rule.updatedAt === "string" ? rule.updatedAt.slice(0, 10) : rule.updatedAt instanceof Date ? rule.updatedAt.toISOString().slice(0, 10) : ""}
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
                    <details>
                      <summary class="cursor-pointer rounded-md border border-border px-2 py-1 text-xs">Edit</summary>
                      <form method="POST" action="?/update" class="mt-2 grid min-w-72 gap-2">
                        <Input type="hidden" name="id" value={rule.id} />
                        <Input name="name" aria-label={`Edit name ${rule.name}`} value={rule.name} />
                        <Input name="actionAgent" aria-label={`Edit agent ${rule.name}`} value={rule.actionAgent} />
                        <Textarea name="conditionsJson" aria-label={`Edit conditions ${rule.name}`} class="font-mono text-xs">{JSON.stringify(rule.conditionsJson)}</Textarea>
                        <Button type="submit" variant="outline">Save</Button>
                      </form>
                    </details>
                    <form method="POST" action="?/reorder">
                      <Input type="hidden" name="orderedIds" value={[rule.id, ...rules.filter((candidate) => candidate.id !== rule.id).map((candidate) => candidate.id)].join(",")} />
                      <Button type="submit" data-routing-reorder-up disabled={index === 0} variant="outline" size="xs">Up</Button>
                    </form>
                    <form method="POST" action="?/reorder">
                      <Input type="hidden" name="orderedIds" value={[...rules.filter((candidate) => candidate.id !== rule.id).map((candidate) => candidate.id), rule.id].join(",")} />
                      <Button type="submit" data-routing-reorder-down disabled={index === rules.length - 1} variant="outline" size="xs">Down</Button>
                    </form>
                    <form method="POST" action="?/delete">
                      <Input type="hidden" name="id" value={rule.id} />
                      <Button type="submit" data-routing-delete={rule.id} variant="danger" size="xs">Delete</Button>
                    </form>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>

      {#if inheritedRules.length > 0}
        <section aria-label="Inherited global rules" class="mt-4 rounded-md border border-border p-4">
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
    </div>
  {/if}

  <!-- ==================== DRAFTS TAB ==================== -->
  {#if activeTab === "drafts"}
    <div data-routing-drafts-tab>
      <header class="flex items-center justify-between gap-4">
        <p class="text-sm text-muted-foreground">{data.drafts.length} draft{data.drafts.length !== 1 ? "s" : ""}</p>
      </header>

      <section aria-label="Routing drafts" class="mt-4 overflow-x-auto rounded-md border border-border">
        <table data-routing-drafts-table class="w-full min-w-[960px] text-sm">
          <thead class="border-b border-border bg-muted/50">
            <tr>
              <th class="px-4 py-2 text-left font-medium">Draft ID</th>
              <th class="px-4 py-2 text-left font-medium">Proposed rule</th>
              <th class="px-4 py-2 text-left font-medium">Source</th>
              <th class="px-4 py-2 text-left font-medium">Confidence</th>
              <th class="px-4 py-2 text-left font-medium">Conflict state</th>
              <th class="px-4 py-2 text-left font-medium">Matching active rules</th>
              <th class="px-4 py-2 text-left font-medium">Created</th>
              <th class="px-4 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each data.drafts as draft (draft.id)}
              <tr data-draft-row={draft.id} class="border-b border-border last:border-0">
                <td class="px-4 py-3 font-mono text-xs">{draft.id.slice(0, 8)}</td>
                <td class="px-4 py-3 font-medium">{draft.proposedRule}</td>
                <td class="px-4 py-3">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-xs">{draft.source}</span>
                </td>
                <td class="px-4 py-3">
                  {#if draft.confidence !== null}
                    <span>{(draft.confidence * 100).toFixed(0)}%</span>
                  {:else}
                    <span class="text-muted-foreground">-</span>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  {#if draft.conflictState === "review_needed"}
                    <span class="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Review needed</span>
                  {:else if draft.conflictState === "conflict"}
                    <span class="rounded-md bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Conflict</span>
                  {:else if draft.conflictState === "abstained"}
                    <span class="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">Abstained</span>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  {#if draft.matchingActiveRuleIds.length > 0}
                    <div class="flex flex-wrap gap-1">
                      {#each draft.matchingActiveRuleIds as activeId}
                        <span class="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{activeId.slice(0, 8)}</span>
                      {/each}
                    </div>
                  {:else}
                    <span class="text-muted-foreground">-</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-xs text-muted-foreground">
                  {typeof draft.createdAt === "string" ? draft.createdAt.slice(0, 10) : ""}
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
                    {#if draft.conflictState === "review_needed"}
                      <form method="POST" action="?/draftApprove">
                        <Input type="hidden" name="draftId" value={draft.id} />
                        <Button type="submit" data-approve-draft={draft.id} size="xs">Approve draft</Button>
                      </form>
                    {/if}
                    <form method="POST" action="?/draftDelete">
                      <Input type="hidden" name="draftId" value={draft.id} />
                      <Button type="submit" data-delete-draft={draft.id} variant="danger" size="xs">Delete</Button>
                    </form>
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="8" class="px-4 py-8 text-center text-sm text-muted-foreground">
                  <p>No drafts yet</p>
                  <p class="mt-1 text-xs">Run a route test or enable LLM routing to capture disabled learned drafts.</p>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    </div>
  {/if}

  <!-- ==================== TEST TAB ==================== -->
  {#if activeTab === "test"}
    <div data-routing-test-tab>
      <Card aria-label="Test routing" size="sm">
        <CardHeader>
          <CardTitle>Test routing</CardTitle>
        </CardHeader>
        <CardContent>
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
            <Textarea
              name="taskJson"
              aria-label="Task JSON"
              rows="5"
              class="font-mono text-xs"
            >{defaultTaskJson}</Textarea>
          </label>
          <Button type="submit" class="w-fit">Test routing</Button>
        </form>
        </CardContent>
      </Card>

      {#if enrichedResult}
        <section data-routing-enriched-result class="mt-4 rounded-md border border-border p-4">
          <h3 class="text-sm font-semibold">Enriched Result</h3>
          <pre class="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{JSON.stringify(enrichedResult, null, 2)}</pre>
        </section>
      {/if}
    </div>
  {/if}

  <!-- ==================== LLM GATE TAB ==================== -->
  {#if activeTab === "llm-gate"}
    <div data-routing-llm-gate-tab>
      <Card size="sm">
        <CardHeader>
          <CardTitle>LLM Gate Configuration</CardTitle>
          <p class="mt-1 text-sm text-muted-foreground">Configure LLM fallback routing behavior.</p>
        </CardHeader>
        <CardContent>

        <form method="POST" action="?/updateLlmGate" class="mt-4 grid max-w-md gap-4">
          <label class="flex items-center gap-3 text-sm">
            <Input type="hidden" name="enabled" value={llmEnabled ? "true" : "false"} />
            <Switch
              checked={llmEnabled}
              onchange={() => (llmEnabled = !llmEnabled)}
              aria-label="Enable LLM routing fallback"
            />
            <span>Enable LLM routing fallback</span>
          </label>

          <label class="grid gap-1 text-sm">
            <span>Input mode</span>
            <select
              name="inputMode"
              bind:value={llmInputMode}
              class="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="full_context">Full context (default)</option>
              <option value="task_plus_history">Task + routing history</option>
              <option value="task_facts">Task facts only</option>
            </select>
          </label>

          {#if !llmEnabled}
            <p class="text-xs text-muted-foreground">LLM routing is disabled. Rules will use deterministic matching only.</p>
          {/if}

          <Button type="submit" class="w-fit">Save configuration</Button>
        </form>
        </CardContent>
      </Card>
    </div>
  {/if}

  <!-- ==================== EVIDENCE TAB ==================== -->
  {#if activeTab === "evidence"}
    <div data-routing-evidence-tab>
      <section data-routing-evidence class="rounded-md border border-border p-4">
        <h2 class="text-base font-semibold">Routing Evidence</h2>
        <p class="mt-1 text-sm text-muted-foreground">View routing decision evidence from tests and LLM fallback.</p>

        {#if enrichedResult}
          <div class="mt-4 grid gap-3">
            <div class="rounded-md border border-border p-3">
              <h3 class="text-sm font-medium">Status</h3>
              <p class="mt-1 text-sm">{enrichedResult.status}</p>
            </div>

            {#if enrichedResult.matchedRuleId}
              <div class="rounded-md border border-border p-3">
                <h3 class="text-sm font-medium">Matched Rule</h3>
                <p class="mt-1 font-mono text-sm">{enrichedResult.matchedRuleId}</p>
              </div>
            {/if}

            {#if enrichedResult.factsUsed && Object.keys(enrichedResult.factsUsed).length > 0}
              <div class="rounded-md border border-border p-3">
                <h3 class="text-sm font-medium">Facts Used</h3>
                <pre class="mt-1 overflow-x-auto font-mono text-xs">{JSON.stringify(enrichedResult.factsUsed, null, 2)}</pre>
              </div>
            {/if}

            {#if enrichedResult.evidence && enrichedResult.evidence.length > 0}
              <div class="rounded-md border border-border p-3">
                <h3 class="text-sm font-medium">Evidence</h3>
                <ul class="mt-1 list-inside list-disc text-sm">
                  {#each enrichedResult.evidence as item}
                    <li class="text-xs">{item}</li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if enrichedResult.whyUnmatched}
              <div class="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <h3 class="text-sm font-medium text-amber-800 dark:text-amber-400">Why unmatched</h3>
                <p class="mt-1 text-sm text-amber-700 dark:text-amber-300">{enrichedResult.whyUnmatched}</p>
              </div>
            {/if}

            {#if enrichedResult.backend || enrichedResult.model}
              <div class="rounded-md border border-border p-3">
                <h3 class="text-sm font-medium">Backend / Model</h3>
                <p class="mt-1 text-sm">{enrichedResult.backend ?? "N/A"} / {enrichedResult.model ?? "N/A"}</p>
              </div>
            {/if}
          </div>
        {:else}
          <p class="mt-4 text-sm text-muted-foreground">No evidence available. Run a route test to capture routing evidence.</p>
        {/if}
      </section>
    </div>
  {/if}

  <!-- ==================== COMMON: dry run result (legacy) ==================== -->
  {#if activeTab !== "test" && form?.dryRunResult}
    <section aria-label="Dry-run result" class="rounded-md border border-border p-4">
      <p data-routing-dry-run-result class="text-sm">
        {#if dryRunRule}
          {dryRunRule.name} -&gt; {form.dryRunResult.agent}
        {:else if form.dryRunResult.ruleId}
          {form.dryRunResult.ruleId} -&gt; {form.dryRunResult.agent}
        {:else}
          no match
        {/if}
      </p>
    </section>
  {/if}
</div>
