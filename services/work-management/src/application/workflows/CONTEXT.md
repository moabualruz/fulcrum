# Workflows

Application surface for reading and mutating a Project's **WorkflowConfig** (see parent `services/work-management/CONTEXT.md`): the methodology, enabled task types, and Status-to-Status transition graph. Thin command/query delegates over `WorkflowRulesService`; owns no persistence.

## Language

**TransitionGraph**:
The serialized `status → allowedNextStatuses[]` map portion of a Project's WorkflowConfig.
_Avoid_: Transition map, status graph, state machine.

**TransitionValidationResult**:
The verdict returned when checking whether a single `fromStatus → toStatus` move is legal under the current TransitionGraph.
_Avoid_: Guard result, transition check, validation outcome.

## Relationships

- A **Project** has exactly one **TransitionGraph** (the persisted slice of its WorkflowConfig).
- A **TransitionValidationResult** is computed against one **Project**'s current **TransitionGraph** for one `(fromStatus, toStatus)` pair.

## Example dialogue

> **Dev:** "Where does the **TransitionGraph** live — is it its own table?"
> **Domain expert:** "No. It's the `transitions` field inside `Project.workflowConfig`. This sub-area just exposes read/write entrypoints over it; the entity is still Project."
> **Dev:** "So `validateTransition` reads the graph and returns a **TransitionValidationResult** — it doesn't fire Automations?"
> **Domain expert:** "Right. Validation is the synchronous gate. Automations are the parent-context concept for post-commit reactions and live outside this folder."

## Flagged ambiguities

- **TransitionGraph vs WorkflowConfig** — resolved: **WorkflowConfig** is the whole Project-scoped object (methodology + enabledTaskTypes + transitions). **TransitionGraph** is only the transitions map. Use the narrower term when the methodology and task-type fields are not in scope.
