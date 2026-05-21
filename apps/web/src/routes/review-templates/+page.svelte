<!--
  Review-comment template library: reusable structured feedback templates.

  Absorption note (`prd-web-review-workbench-od-fidelity`,
  `design-alignment/review.md` §review.html migration): the five built-in
  templates are absorbed into the Review workbench (`/review/<reviewId>`) as the
  Comments-panel composer template picker: selecting a template seeds the
  composer body. This route is kept as the template-library management surface
  (custom-template authoring, scope filtering), with no feature loss; the
  workbench consumes the template set as a composer affordance.
-->
<script lang="ts">
  type TemplateKind = "missing-criteria" | "stale-context" | "prototype-mismatch" | "test-gap" | "code-risk";
  type Scope = "workspace" | "planning" | "uat" | "code-review";

  type Template = {
    id: string;
    kind: TemplateKind;
    label: string;
    scope: Scope;
    fields: { name: string; placeholder: string }[];
    bodyTemplate: string;
  };

  const BUILT_IN: Template[] = [
    {
      id: "tpl_missing_criteria",
      kind: "missing-criteria",
      label: "Missing acceptance criteria",
      scope: "planning",
      fields: [
        { name: "section", placeholder: "Plan section" },
        { name: "gap", placeholder: "What is missing" },
      ],
      bodyTemplate: "Plan section {section} omits acceptance criteria for {gap}. Add explicit pass/fail signal.",
    },
    {
      id: "tpl_stale_context",
      kind: "stale-context",
      label: "Stale context",
      scope: "planning",
      fields: [
        { name: "ref", placeholder: "Doc or link" },
        { name: "expected", placeholder: "Current source" },
      ],
      bodyTemplate: "Reference {ref} no longer matches reality. Latest source: {expected}.",
    },
    {
      id: "tpl_prototype_mismatch",
      kind: "prototype-mismatch",
      label: "Prototype mismatch",
      scope: "uat",
      fields: [
        { name: "screen", placeholder: "Screen or component" },
        { name: "diff", placeholder: "Observed difference" },
      ],
      bodyTemplate: "Implementation of {screen} diverges from prototype: {diff}.",
    },
    {
      id: "tpl_test_gap",
      kind: "test-gap",
      label: "Test gap",
      scope: "code-review",
      fields: [
        { name: "behavior", placeholder: "Behavior" },
        { name: "where", placeholder: "Test file or layer" },
      ],
      bodyTemplate: "Behavior '{behavior}' lacks coverage; add test in {where}.",
    },
    {
      id: "tpl_code_risk",
      kind: "code-risk",
      label: "Code risk",
      scope: "code-review",
      fields: [
        { name: "file", placeholder: "File or symbol" },
        { name: "risk", placeholder: "Risk class (perf, data, security)" },
      ],
      bodyTemplate: "{file} introduces {risk} risk. Mitigation required before merge.",
    },
  ];

  let templates = $state<Template[]>([...BUILT_IN]);
  let selectedId = $state<string>(BUILT_IN[0]!.id);
  let scopeFilter = $state<Scope | "all">("all");
  let values = $state<Record<string, string>>({});
  let renderedBody = $state<string>("");
  let submitted = $state<{ kind: TemplateKind; body: string; fields: Record<string, string> } | null>(null);

  let newLabel = $state("");
  let newScope = $state<Scope>("workspace");
  let newBody = $state("");

  const visibleTemplates = $derived(scopeFilter === "all" ? templates : templates.filter((t) => t.scope === scopeFilter));
  const selected = $derived(templates.find((t) => t.id === selectedId) ?? templates[0]);

  function render(): void {
    if (!selected) return;
    let body = selected.bodyTemplate;
    for (const f of selected.fields) {
      body = body.replaceAll(`{${f.name}}`, values[f.name] ?? `{${f.name}}`);
    }
    renderedBody = body;
  }

  function submit(): void {
    if (!selected) return;
    if (!renderedBody) render();
    submitted = { kind: selected.kind, body: renderedBody, fields: { ...values } };
  }

  function addCustom(event: Event): void {
    event.preventDefault();
    if (!newLabel.trim() || !newBody.trim()) return;
    const id = `tpl_${newLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    templates = [
      ...templates,
      {
        id,
        kind: "code-risk",
        label: newLabel.trim(),
        scope: newScope,
        fields: [],
        bodyTemplate: newBody.trim(),
      },
    ];
    newLabel = "";
    newBody = "";
  }
</script>

<svelte:head>
  <title>Review templates | Fulcrum</title>
</svelte:head>

<main class="mx-auto max-w-4xl space-y-6 p-6" data-review-templates-page>
  <header>
    <h1 class="text-2xl font-semibold">Review templates</h1>
    <p class="text-sm text-muted-foreground">Reusable, structured feedback templates for planning, UAT, and code review.</p>
  </header>

  <section class="space-y-3 rounded-md border border-border p-4">
    <div class="flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2 text-xs">
        Scope
        <select data-template-scope-filter bind:value={scopeFilter} class="rounded-md border border-border bg-background px-2 py-1 text-xs">
          <option value="all">all</option>
          <option value="workspace">workspace</option>
          <option value="planning">planning</option>
          <option value="uat">uat</option>
          <option value="code-review">code review</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-xs">
        Template
        <select data-template-select bind:value={selectedId} class="rounded-md border border-border bg-background px-2 py-1 text-xs">
          {#each visibleTemplates as t}
            <option value={t.id}>{t.label}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="grid gap-3" data-template-fields>
      {#each (selected?.fields ?? []) as f}
        <label class="flex flex-col gap-1 text-xs">
          {f.name}
          <input
            data-template-field={f.name}
            type="text"
            bind:value={values[f.name]}
            placeholder={f.placeholder}
            class="rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </label>
      {/each}
    </div>

    <div class="flex items-center gap-2">
      <button type="button" data-template-render onclick={render} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Render</button>
      <button type="button" data-template-submit onclick={submit} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Submit</button>
    </div>

    <textarea
      data-template-body
      bind:value={renderedBody}
      rows="3"
      class="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
      aria-label="Rendered template body (editable before submit)"
    ></textarea>

    {#if submitted}
      <div data-template-submitted class="rounded-md border border-border bg-muted/40 p-3 text-xs">
        <p>Submitted kind: <span data-template-submitted-kind>{submitted.kind}</span></p>
        <p>Body: <span data-template-submitted-body>{submitted.body}</span></p>
      </div>
    {/if}
  </section>

  <section class="space-y-3 rounded-md border border-border p-4">
    <h2 class="text-base font-medium">Custom templates</h2>
    <form onsubmit={addCustom} class="grid gap-2">
      <input data-template-new-label bind:value={newLabel} placeholder="Template name" class="rounded-md border border-border bg-background px-2 py-1 text-sm" />
      <select data-template-new-scope bind:value={newScope} class="rounded-md border border-border bg-background px-2 py-1 text-sm">
        <option value="workspace">workspace</option>
        <option value="planning">planning</option>
        <option value="uat">uat</option>
        <option value="code-review">code-review</option>
      </select>
      <textarea data-template-new-body bind:value={newBody} placeholder="Template body with placeholders" rows="2" class="rounded-md border border-border bg-background px-2 py-1 text-sm"></textarea>
      <button type="submit" data-template-new-add class="self-start rounded-md border border-border bg-background px-3 py-1 text-xs">Add custom template</button>
    </form>
  </section>
</main>
