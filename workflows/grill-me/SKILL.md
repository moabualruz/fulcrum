# grill-me

A structured discovery and requirements-clarification workflow.

The workflow asks clarifying questions to fully understand a request before moving to planning.

## Usage
Invoke via: `pi workflow run grill-me --workspace <ws_id> --project <proj_id>`

## Inputs
- `initial_request` (required): The user's initial request or problem statement
- `workspace_id` (required)
- `project_id` (required)

## Outputs
- Structured grill-me artifact (markdown)
- PRD draft stub (if sufficient context gathered)
- Memory write: task context

## Spec
§23.3: first-class human-input, resumable, structured output artifact, task context memory write
