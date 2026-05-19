# Templates

Sub-area of work-management owning the template engine: loading template sources (built-in, markdown, directory), normalizing them into a uniform shape, and previewing their effects under a trust policy before instantiation.

## Language

**TemplateSource**:
A raw, unvalidated template description loaded from a built-in id, a markdown file with YAML frontmatter, or a directory containing `fulcrum-template.yaml`.
_Avoid_: Template file, blueprint source, raw template.

**TemplateSourceRef**:
The locator passed to the loader, tagged `built-in | markdown | directory`, identifying where to read a TemplateSource from.
_Avoid_: Template path, reference, handle.

**NormalizedTemplate**:
The validated, expanded template after Zod parsing and module normalization, carrying `modules`, `projectTree`, `docs`, `workItems`, `policies`, `automations`, `reports`, `effects`, and a derived `workflow`.
_Avoid_: Parsed template, resolved template, compiled template.

**TemplateEffect**:
A single side-effecting step declared by a NormalizedTemplate (`id`, `kind`, optional `command`, `destructive`, `authorityEscalation`) that the engine previews against a trust policy before execution.
_Avoid_: Action, step, hook (hook is an effect `kind`, not the effect itself), command.

**EffectPreview**:
The per-effect output of `previewTemplateEffects`: `{ id, kind, dryRun, approvalRequired, auditRequired }`, derived by `evaluateTemplateTrustPolicy`.
_Avoid_: Plan, dry-run result, simulation.

**BuiltInTemplate**:
A TemplateSource produced in-process rather than read from disk; currently only `AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID`.
_Avoid_: Default template, seed template, factory template.

**WorkItemTemplate**:
The persisted `TaskTemplate` row (see parent `CONTEXT.md` → Template) returned by the DB-backed CRUD queries in `queries.ts`; distinct from the engine's in-memory NormalizedTemplate.
_Avoid_: Stored template, DB template, persisted template.

**DocTemplate**:
A knowledge-workspace `DocTemplateRow` resolved via `DocTemplateService` for a given `(orgId, projectId, docType)`; surfaced here only as a query passthrough.
_Avoid_: Doc preset, document blueprint.

## Relationships

- A **TemplateSourceRef** resolves to exactly one **TemplateSource** via `loadTemplateSource`.
- A **TemplateSource** normalizes into one **NormalizedTemplate** via `normalizeTemplate`.
- A **NormalizedTemplate** has many **TemplateEffects**; each effect produces one **EffectPreview** under a trust policy.
- A **BuiltInTemplate** is one kind of **TemplateSource**.
- **WorkItemTemplate** rows and **DocTemplate** rows are persisted artifacts queried through `queries.ts`; the engine does not consume them and they do not flow through `normalizeTemplate`.

## Example dialogue

> **Dev:** "If I load a **TemplateSource** from markdown, do I get a **NormalizedTemplate** back?"
> **Domain expert:** "No — `loadTemplateSource` returns the raw TemplateSource. You pass it to `normalizeTemplate` to get the NormalizedTemplate with expanded modules and the derived workflow."
> **Dev:** "And the **TemplateEffects** — are they executed when I normalize?"
> **Domain expert:** "Never. Normalization is pure. You call `previewTemplateEffects` with a trust policy to get EffectPreviews; execution lives outside this sub-area."

## Flagged ambiguities

- **Template (engine) vs Template (entity)** — resolved: the engine's **NormalizedTemplate** is an in-memory shape produced from a TemplateSource; the parent context's **Template** is the persisted `TaskTemplate` row exposed here as **WorkItemTemplate**. They never share storage.
- **TemplateEffect vs Automation** — resolved: a **TemplateEffect** is a step declared inside a template definition and previewed at instantiation time; an **Automation** (parent context) is a runtime Project rule. Do not collapse.
- **Module (template) vs Module (Task grouping)** — resolved: a template `modules` entry (e.g. `repo`, `docs`, `workflow`) enables a feature area for the generated Project; the parent context's **Module** is a `Task.moduleId` grouping. Same word, different layers — never collapse.
