# MCP Tool Contract

## Transport

- Default MCP server transport is stdio using the MCP TypeScript SDK.
- Local clients spawn Fulcrum MCP with command and args, using SDK stdio client transport semantics.
- Loopback transport may be offered for local clients only on `127.0.0.1` by default.
- Non-loopback bind requires explicit operator approval and visible doctor/privacy status.

## Common Tool Response

```json
{
  "schemaVersion": "1.0",
  "requestId": "req_01",
  "status": "ok",
  "data": {},
  "degraded": [],
  "policyDecisionIds": [],
  "redactionStatus": "redacted_or_not_applicable"
}
```

Errors are structured and actionable:

```json
{
  "schemaVersion": "1.0",
  "requestId": "req_01",
  "status": "error",
  "error": {
    "code": "CAPABILITY_DEGRADED",
    "message": "Semantic code search is disabled.",
    "nextAction": "Use exact code search or enable a semantic adapter.",
    "capabilityId": "cap_semantic_code",
    "policyDecisionId": null,
    "redactionStatus": "not_applicable"
  }
}
```

## Tools

Tool names use SRS snake_case as canonical names. Dot-separated names may be
exposed as compatibility aliases only if they call the same schema and core
service.

### `fulcrum_doctor_status`

Alias: `fulcrum.doctor.status`.
Input: optional `projectId`, optional `deep`, optional `noNetwork`.
Output: capability health records matching CLI doctor states.

### `fulcrum_project_list`

Alias: `fulcrum.project.list`.
Input: optional `healthState`, optional `privacyMode`, optional `limit`.
Output: projects with health, task/run counts, adapter states, and privacy status.

### `fulcrum_task_get`

Input: `taskId`.
Output: task details, current run, linked project, policy constraints, degraded-state notices, source links, and next action.

### `fulcrum_task_claim`

Input: `taskId`, `requester`, optional `agentId`.
Output: claimed task or structured denial if status/policy blocks claim.

### `fulcrum_task_update_status`

Input: `taskId`, `status`, `requester`, optional `reason`, optional `policyDecisionId`.
Output: updated task or invalid-transition/policy response.

### `fulcrum_task_list`

Input: optional `projectId`, `status`, `agentId`, `queue`, `limit`.
Output: task summaries with IDs, statuses, priorities, blockers, current run, degraded impact, and freshness.

### `fulcrum_run_start`

Input: `taskId`, `agentId`, optional `contextPackId`, optional `worktreePolicyOverride`, optional `previewOnly`.
Output: run preview or created run. Dangerous effects return approval-required response.

### `fulcrum_run_heartbeat`

Input: `runId`, `source`, `message`, optional `progress`, optional `artifactRefs`.
Output: recorded event and updated heartbeat state.

### `fulcrum_run_event`

Input: `runId`, `type`, `severity`, `payloadSummary`, optional `payloadRef`, optional `artifactRefs`.
Output: append-only event ID. Payload is redacted before storage.

### `fulcrum_run_complete`

Input: `runId`, `summary`, `outcome`, optional `artifactIds`, optional `qualityGateResultIds`.
Output: completion result or blocked/approval-required response if required gates, policy decisions, or review state are missing.

### `fulcrum_context_build`

Input: `taskId`, optional `runId`, `budget`, `lanes`, `offlineOnly`, `format`.
Output: context pack with context items, omissions, degraded lanes, source refs, freshness, evidence types, confidence/limitations, and export refs.

### `fulcrum_context_get`

Input: `contextPackId`.
Output: context pack and items.

### `fulcrum_context_explain`

Input: `contextPackId`.
Output: inclusion reasons, omitted items, degraded lanes, stale evidence, freshness, and budget decisions.

### `fulcrum_memory_search`

Input: `projectId`, `query`, optional `limit`, optional `status`.
Output: memory entries with source refs, linked refs, freshness, backend, rank, reason, and limitations.

### `fulcrum_memory_add`

Input: `projectId`, `title`, `body` or `fileRef`, `sourceRefs`, optional `linkedTaskId`, optional `linkedRunId`, optional `permanent`.
Output: draft memory entry and policy decision if permanent write requested.

### `fulcrum_code_search`

Input: `projectId`, `query`, `modes`, optional `paths`, optional `limit`, optional `includeSemantic`.
Output: code evidence with file refs, line refs when available, source tool, ignored path behavior, freshness, result count, evidence type, and ranking reason.

### `fulcrum_repo_map_get`

Input: `projectId`, optional `refresh`, optional `paths`.
Output: repo-map artifact/evidence refs with cache metadata, freshness, tool version, and limitations.

### `fulcrum_repomix_pack`

Input: `projectId`, optional `paths`, optional `previewOnly`, optional `budget`.
Output: repo-pack artifact/evidence refs with included file preview, ignored-path behavior, redaction status, size, and freshness.

### `fulcrum_worktree_allocate`

Input: `taskId`, optional `runId`, optional `policyDecisionId`, optional `previewOnly`.
Output: worktree allocation, existing-workspace justification, or policy-required response.

### `fulcrum_worktree_status`

Input: `worktreeId`.
Output: dirty state, untracked count, uncommitted count, unpushed commits, conflicts, cleanup eligibility, block reason, artifacts, gates, and merge readiness.

### `fulcrum_artifact_attach`

Input: `runId`, `type`, `localRef` or `contentRef`, `summary`, optional `linkedRefs`.
Output: artifact record with hash, size, redaction status, and linked run/task.

### `fulcrum_quality_gate_run`

Input: `projectId`, `gateName`, optional `taskId`, optional `runId`, optional `previewOnly`.
Output: quality gate result or approval-required response if command crosses policy boundary.

### `fulcrum_policy_check`

Input: `action`, `subjectType`, `subjectId`, `requester`, optional `runId`, optional `taskId`, optional `preview`.
Output: `allowed`, `denied`, or `approval_required` with reason, audit record, bypass scope, and next action.

## Resources

- `fulcrum://projects/{projectId}` returns project summary.
- `fulcrum://tasks/{taskId}` returns task detail.
- `fulcrum://runs/{runId}` returns run detail and event refs.
- `fulcrum://context-packs/{contextPackId}` returns context pack.
- `fulcrum://artifacts/{artifactId}` returns artifact metadata and local reference.
- `fulcrum://doctor` returns local health report.

## Policy Requirements

MCP tools cannot bypass policy. Worktree deletion, branch reset, untracked cleanup, merge, arbitrary shell execution, permanent memory write, memory deletion, external writeback, backup purge, sensitive export, remote provider call in local-only mode, public bind, and disabled adapter access return denied or approval-required by default.

## Call Logging Requirements

Every MCP call records tool name, caller if known, run ID if known, parameter
hash, redacted parameters, result summary, timestamp, redaction status, and
linked policy decision IDs. Logs are local by default and follow the same
retention/export/reset rules as run events and artifacts.

## Recommended Skill Calls

Use [../skill-calls.md](../skill-calls.md) as the full catalog. For MCP
contracts, prioritize [$agent-native-architecture](/home/mkh/.raise/profiles/vanilla/codex/skills/agent-native-architecture/SKILL.md),
[$agent-native-reviewer](/home/mkh/.raise/profiles/vanilla/codex/skills/agent-native-reviewer/SKILL.md),
[$api-contract-reviewer](/home/mkh/.raise/profiles/vanilla/codex/skills/api-contract-reviewer/SKILL.md),
[$security-and-hardening](/home/mkh/.raise/profiles/vanilla/codex/skills/security-and-hardening/SKILL.md),
[$source-driven-development](/home/mkh/.raise/profiles/vanilla/codex/skills/source-driven-development/SKILL.md),
and [$test-driven-development](/home/mkh/.raise/profiles/vanilla/codex/skills/test-driven-development/SKILL.md).
