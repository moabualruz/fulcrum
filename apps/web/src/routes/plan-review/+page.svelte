<script lang="ts">
  import { Badge, Button, Chip } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  type Stage = {
    id: string;
    label: string;
    route: string;
    status: "Ready" | "Active" | "Blocked" | "Queued";
    purpose: string;
    nextAction: string;
    evidence: string;
  };

  type Rule = {
    id: string;
    trigger: string;
    field: string;
    value: string;
    action: string;
    actionValue: string;
  };

  type CustomFieldType = "text" | "number" | "date" | "select" | "multi-select" | "user" | "url";

  type CustomField = {
    id: string;
    name: string;
    type: CustomFieldType;
    required: boolean;
    defaultValue: string;
    options: string[];
  };

  const stages: Stage[] = [
    {
      id: "docs",
      label: "Docs",
      route: "/docs/BRIEF-42",
      status: "Ready",
      purpose: "Capture source material, decisions, constraints, and references before planning starts.",
      nextAction: "Send to planning",
      evidence: "brief.md version v7",
    },
    {
      id: "planning",
      label: "Planning",
      route: "/planning",
      status: "Active",
      purpose: "Generate the plan, prototype artifacts, and task breakdown from the selected context.",
      nextAction: "Open prototype review",
      evidence: "plan_42 trace_9f73",
    },
    {
      id: "execution",
      label: "Execution",
      route: "/build-board",
      status: "Queued",
      purpose: "Materialized tasks enter the execution board with dependency order and run ownership.",
      nextAction: "Dispatch first task",
      evidence: "3 task drafts queued",
    },
    {
      id: "review",
      label: "Review",
      route: "/review",
      status: "Queued",
      purpose: "Review code, artifacts, generated checks, and acceptance evidence before handoff.",
      nextAction: "Request code review",
      evidence: "review packet pending",
    },
    {
      id: "uat",
      label: "UAT",
      route: "/projects/acme/review/uat",
      status: "Blocked",
      purpose: "Approve or reject the user acceptance handoff once review clears blocking feedback.",
      nextAction: "Resolve review blockers",
      evidence: "2 blockers remain",
    },
    {
      id: "e2e",
      label: "E2E",
      route: "/projects/acme/review/e2e",
      status: "Queued",
      purpose: "Run generated E2E coverage and attach result artifacts to the review trail.",
      nextAction: "Run generated E2E",
      evidence: "generated suite ready",
    },
  ];

  let selectedStage = $state<Stage>(stages[1]);
  let triggerType = $state("state_changed");
  let conditionField = $state("state");
  let conditionValue = $state("Done");
  let actionType = $state("archive");
  let actionValue = $state("");
  let ruleValidation = $state("");
  let previewText = $state("Sample issue AUTH-42 would be archived when state changes to Done.");
  let savedRules = $state<Rule[]>([
    {
      id: "rule-existing-review",
      trigger: "issue.created",
      field: "priority",
      value: "urgent",
      action: "assign",
      actionValue: "triage-owner",
    },
  ]);
  let customFieldName = $state("");
  let customFieldType = $state<CustomFieldType>("text");
  let customFieldRequired = $state(false);
  let customFieldDefault = $state("");
  let customFieldOptions = $state("Low, Medium, High");
  let customFieldValidation = $state("");
  let issueDraftTitle = $state("");
  let customFieldInput = $state<Record<string, string>>({});
  let customFields = $state<CustomField[]>([
    {
      id: "priority",
      name: "Priority",
      type: "select",
      required: false,
      defaultValue: "Medium",
      options: ["Low", "Medium", "High"],
    },
  ]);
  let createdIssue = $state<{ title: string; fields: Record<string, string> } | null>(null);

  const triggerOptions = [
    { value: "issue.created", label: "issue.created", scope: "issue" },
    { value: "state_changed", label: "state_changed", scope: "issue" },
    { value: "cycle_started", label: "cycle_started", scope: "cycle" },
    { value: "cycle_ended", label: "cycle_ended", scope: "cycle" },
  ];

  const fieldOptions = [
    { value: "state", label: "state", scope: "issue" },
    { value: "priority", label: "priority", scope: "issue" },
    { value: "assignee", label: "assignee", scope: "issue" },
    { value: "cycle", label: "cycle", scope: "cycle" },
  ];

  const actionOptions = [
    { value: "archive", label: "archive" },
    { value: "close_state", label: "close_state" },
    { value: "change_state", label: "change_state" },
    { value: "assign", label: "assign" },
    { value: "add_label", label: "add_label" },
  ];

  const customFieldTypes: { value: CustomFieldType; label: string; example: string }[] = [
    { value: "text", label: "text", example: "Client Name" },
    { value: "number", label: "number", example: "0" },
    { value: "date", label: "date", example: "2026-05-19" },
    { value: "select", label: "select", example: "Low, Medium, High" },
    { value: "multi-select", label: "multi-select", example: "frontend, backend" },
    { value: "user", label: "user", example: "IUserLite: ada" },
    { value: "url", label: "url", example: "https://example.com" },
  ];

  function openStage(stage: Stage) {
    selectedStage = stage;
  }

  function currentFieldScope(): string {
    return fieldOptions.find((field) => field.value === conditionField)?.scope ?? "issue";
  }

  function currentTriggerScope(): string {
    return triggerOptions.find((trigger) => trigger.value === triggerType)?.scope ?? "issue";
  }

  function validateRule(): string {
    if (!conditionField || !conditionValue.trim()) return "Condition requires field and value.";
    if (!actionType) return "Action required.";
    if (currentTriggerScope() === "cycle" && currentFieldScope() === "issue") {
      return "Cycle triggers cannot validate issue fields.";
    }
    return "";
  }

  function buildRuleSummary(): string {
    const actionSuffix = actionValue.trim() ? ` ${actionValue.trim()}` : "";
    return `When ${triggerType} and ${conditionField} = ${conditionValue.trim()}, ${actionType}${actionSuffix}.`;
  }

  function previewRule(): void {
    const error = validateRule();
    ruleValidation = error;
    if (error) {
      previewText = "Preview blocked until validation passes.";
      return;
    }
    previewText = `Sample issue AUTH-42: ${buildRuleSummary()}`;
  }

  function saveRule(): void {
    const error = validateRule();
    ruleValidation = error;
    if (error) return;
    const rule = {
      id: `rule-${savedRules.length + 1}`,
      trigger: triggerType,
      field: conditionField,
      value: conditionValue.trim(),
      action: actionType,
      actionValue: actionValue.trim(),
    };
    savedRules = [...savedRules, rule];
    previewText = `Saved ${buildRuleSummary()}`;
  }

  function slugify(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function parseOptions(): string[] {
    return customFieldOptions.split(",").map((option) => option.trim()).filter(Boolean);
  }

  function validateDefault(type: CustomFieldType, value: string, options: string[]): string {
    if (!value.trim()) return "";
    if (type === "number" && Number.isNaN(Number(value))) return "Default value must be a number.";
    if (type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Default date must use YYYY-MM-DD.";
    if (type === "url" && !/^https?:\/\//.test(value)) return "Default URL must start with http:// or https://.";
    if ((type === "select" || type === "multi-select") && options.length === 0) return "Select fields need at least one option.";
    return "";
  }

  function createCustomField(): void {
    const name = customFieldName.trim();
    const id = slugify(name);
    const options = customFieldType === "select" || customFieldType === "multi-select" ? parseOptions() : [];
    const duplicate = customFields.some((field) => field.id === id || field.name.toLowerCase() === name.toLowerCase());
    if (!name) {
      customFieldValidation = "Field name required.";
      return;
    }
    if (duplicate) {
      customFieldValidation = "Custom field already exists.";
      return;
    }
    const defaultError = validateDefault(customFieldType, customFieldDefault, options);
    if (defaultError) {
      customFieldValidation = defaultError;
      return;
    }
    const field = { id, name, type: customFieldType, required: customFieldRequired, defaultValue: customFieldDefault.trim(), options };
    customFields = [...customFields, field];
    customFieldInput = { ...customFieldInput, [id]: field.defaultValue };
    customFieldName = "";
    customFieldDefault = "";
    customFieldValidation = "";
  }

  function fieldValue(field: CustomField): string {
    return customFieldInput[field.id] ?? field.defaultValue;
  }

  function updateFieldValue(fieldId: string, value: string): void {
    customFieldInput = { ...customFieldInput, [fieldId]: value };
  }

  function createIssue(): void {
    const missing = customFields.find((field) => field.required && !fieldValue(field).trim());
    if (!issueDraftTitle.trim()) {
      customFieldValidation = "Issue title required.";
      return;
    }
    if (missing) {
      customFieldValidation = `${missing.name} is required before issue creation.`;
      return;
    }
    createdIssue = {
      title: issueDraftTitle.trim(),
      fields: Object.fromEntries(customFields.map((field) => [field.name, fieldValue(field)])),
    };
    customFieldValidation = "";
  }
</script>

<svelte:head>
  <title>Workflow Review</title>
</svelte:head>

<main data-plan-review-page class={cn("mx-auto flex w-full max-w-7xl flex-col gap-4 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8")}>
  <header class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4")}>
    <div class={cn("min-w-0")}>
      <p class={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground")}>Workflow navigation</p>
      <h1 class={cn("text-2xl font-semibold tracking-normal text-foreground")}>Plan review path</h1>
      <p class={cn("mt-1 max-w-3xl text-sm text-muted-foreground")}>
        Move from source docs to planning, execution, review, UAT, and generated E2E without switching through unrelated feature buckets.
      </p>
    </div>
    <Badge variant="success" size="sm" data-workflow-context>trace_9f73 preserved</Badge>
  </header>

  <nav aria-label="Primary workflow path" data-primary-workflow-path class={cn("grid min-w-0 gap-2 md:grid-cols-6")}>
    {#each stages as stage, index}
      <button
        type="button"
        data-workflow-stage={stage.id}
        data-selected={selectedStage.id === stage.id}
        class={cn(
          "min-w-0 rounded-md border border-border bg-card p-3 text-left transition-colors",
          selectedStage.id === stage.id && "border-primary bg-primary/5",
        )}
        onclick={() => openStage(stage)}
      >
        <span class={cn("mb-2 flex flex-wrap items-center gap-2")}>
          <span class={cn("flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold")}>{index + 1}</span>
          <span class={cn("text-sm font-semibold")}>{stage.label}</span>
        </span>
        <Badge variant={stage.status === "Blocked" ? "warning" : stage.status === "Active" ? "success" : "outline"} size="sm">{stage.status}</Badge>
      </button>
    {/each}
  </nav>

  <section class={cn("grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(22rem,1.15fr)]")}>
    <section data-stage-detail class={cn("min-w-0 overflow-hidden rounded-md border border-border bg-card p-4")}>
      <div class={cn("flex flex-wrap items-center gap-2")}>
        <h2 class={cn("text-lg font-semibold")}>{selectedStage.label}</h2>
        <Chip tone="accent">{selectedStage.route}</Chip>
      </div>
      <p class={cn("mt-3 text-sm text-muted-foreground")}>{selectedStage.purpose}</p>
      <dl class={cn("mt-4 grid gap-3 text-sm")}>
        <div class={cn("rounded-md border border-border bg-muted/35 p-3")}>
          <dt class={cn("font-medium")}>Next action</dt>
          <dd data-next-action class={cn("mt-1 text-muted-foreground")}>{selectedStage.nextAction}</dd>
        </div>
        <div class={cn("rounded-md border border-border bg-muted/35 p-3")}>
          <dt class={cn("font-medium")}>Evidence</dt>
          <dd data-stage-evidence class={cn("mt-1 text-muted-foreground")}>{selectedStage.evidence}</dd>
        </div>
      </dl>
      <Button class={cn("mt-4")} data-open-stage-action>{selectedStage.nextAction}</Button>
    </section>

    <aside class={cn("min-w-0 space-y-3")}>
      <section data-breadcrumb-trail class={cn("min-w-0 overflow-hidden rounded-md border border-border bg-muted/35 p-3")}>
        <h2 class={cn("text-base font-semibold")}>Workflow breadcrumb</h2>
        <ol class={cn("mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground")}>
          {#each stages as stage}
            <li>
              <span class={cn("rounded-md border border-border bg-background px-2 py-1", selectedStage.id === stage.id && "border-primary text-foreground")}>
                {stage.label}
              </span>
            </li>
          {/each}
        </ol>
      </section>

      <section data-context-preservation class={cn("min-w-0 overflow-hidden rounded-md border border-border bg-card p-3")}>
        <h2 class={cn("text-base font-semibold")}>Context carried forward</h2>
        <div class={cn("mt-3 grid gap-2 text-sm")}>
          <div class={cn("flex flex-wrap justify-between gap-2 rounded-md border border-border bg-background px-3 py-2")}>
            <span class={cn("text-muted-foreground")}>Project</span>
            <span class={cn("font-mono")}>acme-auth</span>
          </div>
          <div class={cn("flex flex-wrap justify-between gap-2 rounded-md border border-border bg-background px-3 py-2")}>
            <span class={cn("text-muted-foreground")}>Plan</span>
            <span class={cn("font-mono")}>plan_42</span>
          </div>
          <div class={cn("flex flex-wrap justify-between gap-2 rounded-md border border-border bg-background px-3 py-2")}>
            <span class={cn("text-muted-foreground")}>Trace</span>
            <span class={cn("font-mono")}>trace_9f73</span>
          </div>
        </div>
      </section>

      <section data-workflow-next-actions class={cn("min-w-0 overflow-hidden rounded-md border border-border bg-card p-3")}>
        <h2 class={cn("text-base font-semibold")}>Stage next actions</h2>
        <ul class={cn("mt-3 grid gap-2 text-sm")}>
          {#each stages as stage}
            <li data-stage-next-action={stage.id} class={cn("rounded-md border border-border bg-background px-3 py-2")}>
              <span class={cn("font-medium")}>{stage.label}:</span> {stage.nextAction}
            </li>
          {/each}
        </ul>
      </section>
    </aside>
  </section>

  <section data-automation-rule-builder class={cn("grid min-w-0 gap-4 rounded-md border border-border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_22rem]")}>
    <div class={cn("min-w-0")}>
      <div class={cn("flex flex-wrap items-start justify-between gap-3")}>
        <div class={cn("min-w-0")}>
          <h2 class={cn("text-lg font-semibold")}>Automation rule builder</h2>
          <p class={cn("mt-1 text-sm text-muted-foreground")}>Create trigger, condition, and action rules with validation before save.</p>
        </div>
        <Badge data-rule-status variant={ruleValidation ? "destructive" : "success"} size="sm">{ruleValidation ? "invalid" : "valid"}</Badge>
      </div>

      <div class={cn("mt-4 grid gap-3 md:grid-cols-3")}>
        <label class={cn("text-sm font-medium")}>
          Trigger
          <select data-rule-trigger bind:value={triggerType} class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}>
            {#each triggerOptions as trigger}
              <option value={trigger.value}>{trigger.label}</option>
            {/each}
          </select>
        </label>

        <label class={cn("text-sm font-medium")}>
          Condition field
          <select data-rule-condition-field bind:value={conditionField} class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}>
            {#each fieldOptions as field}
              <option value={field.value}>{field.label}</option>
            {/each}
          </select>
        </label>

        <label class={cn("text-sm font-medium")}>
          Condition value
          <input data-rule-condition-value bind:value={conditionValue} class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} />
        </label>

        <label class={cn("text-sm font-medium")}>
          Action
          <select data-rule-action bind:value={actionType} class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}>
            {#each actionOptions as action}
              <option value={action.value}>{action.label}</option>
            {/each}
          </select>
        </label>

        <label class={cn("text-sm font-medium md:col-span-2")}>
          Action value
          <input data-rule-action-value bind:value={actionValue} placeholder="assignee, label, or target state" class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} />
        </label>
      </div>

      {#if ruleValidation}
        <p data-rule-validation role="alert" class={cn("mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive")}>{ruleValidation}</p>
      {/if}

      <div class={cn("mt-4 flex flex-wrap gap-2")}>
        <Button data-preview-rule type="button" variant="outline" onclick={previewRule}>Preview rule</Button>
        <Button data-save-rule type="button" onclick={saveRule}>Save rule</Button>
      </div>
    </div>

    <aside class={cn("min-w-0 space-y-3")}>
      <section data-rule-preview class={cn("rounded-md border border-border bg-background p-3")}>
        <h3 class={cn("text-base font-semibold")}>Preview</h3>
        <p data-rule-preview-text class={cn("mt-2 text-sm text-muted-foreground")}>{previewText}</p>
      </section>

      <section data-saved-rules class={cn("rounded-md border border-border bg-background p-3")}>
        <h3 class={cn("text-base font-semibold")}>Saved rules</h3>
        <div class={cn("mt-3 grid gap-2")}>
          {#each savedRules as rule}
            <article data-saved-rule={rule.id} class={cn("rounded-md border border-border bg-muted/30 p-3 text-sm")}>
              <p data-saved-rule-trigger={rule.id} class={cn("font-medium")}>{rule.trigger}</p>
              <p data-saved-rule-condition={rule.id} class={cn("text-muted-foreground")}>{rule.field} = {rule.value}</p>
              <p data-saved-rule-action={rule.id} class={cn("text-muted-foreground")}>{rule.action}{rule.actionValue ? ` ${rule.actionValue}` : ""}</p>
            </article>
          {/each}
        </div>
      </section>
    </aside>
  </section>

  <section data-custom-fields-builder class={cn("grid min-w-0 gap-4 rounded-md border border-border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_24rem]")}>
    <div class={cn("min-w-0")}>
      <div class={cn("flex flex-wrap items-start justify-between gap-3")}>
        <div class={cn("min-w-0")}>
          <h2 class={cn("text-lg font-semibold")}>Custom fields</h2>
          <p class={cn("mt-1 text-sm text-muted-foreground")}>Add typed fields, set required defaults, and verify they appear on issue create and detail.</p>
        </div>
        <Badge data-custom-field-count variant="outline" size="sm">{customFields.length} fields</Badge>
      </div>

      <div data-field-type-picker class={cn("mt-4 grid gap-3 md:grid-cols-4")}>
        {#each customFieldTypes as type}
          <button
            type="button"
            data-custom-field-type={type.value}
            data-selected={customFieldType === type.value}
            onclick={() => (customFieldType = type.value)}
            class={cn("min-w-0 rounded-md border border-border bg-background p-3 text-left", customFieldType === type.value && "border-primary bg-primary/5")}
          >
            <span class={cn("block text-sm font-medium")}>{type.label}</span>
            <span class={cn("mt-1 block truncate text-xs text-muted-foreground")}>{type.example}</span>
          </button>
        {/each}
      </div>

      <div class={cn("mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem]")}>
        <label class={cn("text-sm font-medium")}>
          Field name
          <input data-custom-field-name bind:value={customFieldName} placeholder="Client Name" class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} />
        </label>
        <label class={cn("text-sm font-medium")}>
          Default value
          <input data-custom-field-default bind:value={customFieldDefault} placeholder="0" class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} />
        </label>
        <label class={cn("flex items-end gap-2 text-sm font-medium")}>
          <input data-custom-field-required type="checkbox" bind:checked={customFieldRequired} class={cn("mb-3 size-4")} />
          <span class={cn("pb-2")}>Required</span>
        </label>
        <label class={cn("text-sm font-medium md:col-span-3")}>
          Select options
          <input data-custom-field-options bind:value={customFieldOptions} class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} />
        </label>
      </div>

      {#if customFieldValidation}
        <p data-custom-field-validation role="alert" class={cn("mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive")}>{customFieldValidation}</p>
      {/if}

      <Button data-create-custom-field type="button" class={cn("mt-4")} onclick={createCustomField}>Create field</Button>

      <div data-custom-field-list class={cn("mt-4 grid gap-2")}>
        {#each customFields as field}
          <article data-custom-field={field.id} data-custom-field-type-row={field.type} data-custom-field-required-row={field.required} class={cn("grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-[minmax(0,1fr)_8rem_8rem]")}>
            <div class={cn("min-w-0")}>
              <p class={cn("truncate text-sm font-medium")}>{field.name}</p>
              <p data-custom-field-default-row={field.id} class={cn("text-xs text-muted-foreground")}>Default: {field.defaultValue || "none"}</p>
            </div>
            <Chip tone="neutral">{field.type}</Chip>
            <Badge variant={field.required ? "warning" : "outline"} size="sm">{field.required ? "required" : "optional"}</Badge>
          </article>
        {/each}
      </div>
    </div>

    <aside class={cn("min-w-0 space-y-3")}>
      <section data-issue-create-custom-fields class={cn("rounded-md border border-border bg-background p-3")}>
        <h3 class={cn("text-base font-semibold")}>Issue create</h3>
        <label class={cn("mt-3 block text-sm font-medium")}>
          Title
          <input data-issue-title bind:value={issueDraftTitle} class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} />
        </label>
        <div class={cn("mt-3 grid gap-2")}>
          {#each customFields as field}
            <label data-issue-create-field={field.id} class={cn("block text-sm font-medium")}>
              {field.name}{field.required ? " *" : ""}
              <input
                data-issue-field-input={field.id}
                value={fieldValue(field)}
                onchange={(event) => updateFieldValue(field.id, event.currentTarget.value)}
                class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
              />
            </label>
          {/each}
        </div>
        <Button data-create-issue-with-fields type="button" class={cn("mt-3")} onclick={createIssue}>Create issue</Button>
      </section>

      <section data-issue-detail-custom-fields class={cn("rounded-md border border-border bg-background p-3")}>
        <h3 class={cn("text-base font-semibold")}>Issue detail</h3>
        {#if createdIssue}
          <p data-created-issue-title class={cn("mt-2 text-sm font-medium")}>{createdIssue.title}</p>
          <dl class={cn("mt-3 grid gap-2 text-sm")}>
            {#each Object.entries(createdIssue.fields) as [name, value]}
              <div data-issue-detail-field={name} class={cn("rounded-md border border-border bg-muted/30 px-3 py-2")}>
                <dt class={cn("font-medium")}>{name}</dt>
                <dd class={cn("text-muted-foreground")}>{value || "empty"}</dd>
              </div>
            {/each}
          </dl>
        {:else}
          <p class={cn("mt-2 text-sm text-muted-foreground")}>Create an issue to see custom fields on detail.</p>
        {/if}
      </section>
    </aside>
  </section>
</main>
