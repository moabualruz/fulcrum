# Plane Adapter Boundary

Capability: PM cockpit candidate.

Plane may provide work item, project, view, page, dashboard, API, and webhook surface.
Fulcrum still owns canonical workspace, project, task, run, artifact, event, policy,
and graph identities.

Validation gates:

- local machine footprint is acceptable
- API can map Plane work items to Fulcrum task refs
- webhooks can feed Fulcrum event stream
- Plane cannot become the only source of task/run truth
- external Jira/Linear/GitHub sync remains optional import/export work
