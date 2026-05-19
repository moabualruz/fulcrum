# Automations

Application-layer boundary that exposes **Automation** CRUD and templates to tRPC/HTTP callers. Thin command/query delegation onto `WorkItemAutomationService`; owns no domain rules. Inherits the parent `services/work-management/CONTEXT.md` for **Automation**, **Project**, **Task**, **WorkflowConfig**.

## Language

**AutomationAppContext**:
The `{ orgId, userId }` caller envelope every command and query receives from the tRPC/HTTP edge to scope the request.
_Avoid_: Session, principal, auth context, RequestContext.

**AutomationTemplate**:
A seeded, read-only `(triggerType, actionType, name, description)` preset returned by `getAutomationTemplates` for UI pickers; not persisted, not an Automation.
_Avoid_: Preset, recipe, blueprint, sample (Template alone refers to `TaskTemplate` in the parent context).

**AutomationCondition**:
The optional predicate object on a create/update input that gates whether an Automation's action runs after its trigger fires; opaque to this boundary, evaluated by the service.
_Avoid_: Filter, guard, rule, JsonRulesCondition (a downstream encoding, not this layer's vocabulary).

## Relationships

- An **AutomationAppContext** scopes one call into the **Automations** boundary; every command and query requires it.
- An **AutomationTemplate** is offered to clients as a starting shape for a new **Automation**; instantiation goes through `createAutomation`, never auto-materialized.
- An **AutomationCondition** is carried on `CreateAutomationInput` / `UpdateAutomationInput` and stored on the resulting **Automation**; this boundary never evaluates it.

## Example dialogue

> **Dev:** "Can I run my **AutomationCondition** here to preview what it would match?"
> **Domain expert:** "No — this sub-area is the tRPC boundary. It serializes the condition onto the **Automation** and hands off to `WorkItemAutomationService`. Evaluation only happens when the trigger fires post-commit. If you need a dry-run, that belongs in the service, not in `commands.ts` / `queries.ts`."
> **Dev:** "And **AutomationTemplate** — does picking one create an **Automation**?"
> **Domain expert:** "Picking is a UI act. The template is a shape the client copies into a `CreateAutomationInput`; the boundary only persists once `createAutomation` is called."

## Flagged ambiguities

- **Template** — in the parent context this means `TaskTemplate`. In this sub-area, bare "Template" is reserved for **AutomationTemplate**; always qualify across boundaries.
- **Condition vs WorkflowConfig** — **AutomationCondition** runs post-trigger and never blocks a status change; the synchronous transition gate is **WorkflowConfig** in the parent context. Do not collapse them.
