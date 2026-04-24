# Data Model: Fulcrum CLI Agent OS Full Product Delivery

## Modeling Rules

- Every first-class entity uses a stable Fulcrum ID with type prefix, creation timestamp, update timestamp, and schema version.
- SQLite is canonical for Fulcrum-owned records. Filesystem paths store artifacts, logs, backups, exports, context files, and managed markdown memory.
- Derived entities are marked `derived: true` and include rebuild source.
- Every record that can appear in CLI, cockpit, MCP, JSONL, or export includes enough state to produce consistent surface output.
- Policy, redaction, provenance, and degraded-state fields are not optional for records crossing trust or evidence boundaries.

## Entity: SetupState

**Fields**: `setupId`, `status`, `stateRoot`, `configPath`, `dbPath`, `artifactRoot`, `logRoot`, `backupRoot`, `managedMemoryRoot`, `createdAt`, `updatedAt`, `appliedBy`, `lastDoctorId`, `privacyMode`, `networkDefault`, `redactionProfileId`, `schemaVersion`.

**Relationships**: Links to `CapabilityHealthRecord`, `PolicyDecision`, `BackupManifest`.

**Validation Rules**:

- `status` is one of `previewed`, `applied`, `needs_repair`, `uninstall_previewed`, `uninstalled`.
- Setup apply must follow a preview or explicitly record why preview was not available.
- State roots must be local filesystem paths.
- No global shell profile, privileged install, or remote service mutation is recorded as applied unless approved by policy.

## Entity: Project

**Fields**: `projectId`, `name`, `rootPath`, `defaultBranch`, `worktreePolicyId`, `privacyMode`, `ignoredPathPolicyId`, `qualityGateSetId`, `enabledCapabilities`, `disabledCapabilities`, `healthState`, `adapterMappings`, `createdAt`, `updatedAt`, `lastScannedAt`.

**Relationships**: Owns `Task`, `Run`, `WorktreeAllocation`, `MemoryEntry`, `CodeEvidence`, `QualityGate`, `CapabilityHealthRecord`, `AdapterConfiguration`.

**Validation Rules**:

- `rootPath` must be an existing local path at registration time or project health is `degraded`.
- Project IDs are stable after registration.
- External mappings cannot replace local project ID or local execution truth.

## Entity: Task

**Fields**: `taskId`, `projectId`, `title`, `descriptionSnapshot`, `status`, `priority`, `labels`, `blockerState`, `assignedAgentId`, `currentRunId`, `linkedFileRefs`, `linkedMemoryRefs`, `linkedArtifactRefs`, `linkedWorktreeId`, `externalSource`, `externalId`, `createdAt`, `updatedAt`, `archivedAt`.

**Relationships**: Belongs to `Project`; may link to `ExternalWorkItemMirror`, `Run`, `ContextPack`, `Artifact`, `GraphLink`, `PolicyDecision`.

**Lifecycle**:

```text
pending -> ready
ready -> running
running -> blocked
running -> review
running -> failed
running -> completed
blocked -> ready
review -> completed
review -> blocked
review -> running
failed -> ready
completed -> archived
```

**Validation Rules**:

- Invalid transitions are rejected unless a policy-approved operator override is recorded.
- `running` requires an active or recently terminal `Run`.
- `completed` requires completion evidence and passing required-gate evidence.
- External task mirror fields never override local run history.

## Entity: ExternalWorkItemMirror

**Fields**: `mirrorId`, `taskId`, `adapterId`, `externalSystem`, `externalId`, `externalUrl`, `sourceTitle`, `sourceBodySnapshot`, `sourceStatus`, `sourceUpdatedAt`, `syncStatus`, `conflictStatus`, `lastImportAt`, `lastWritebackAt`, `writebackPreviewId`, `lastFailure`, `provenance`.

**Relationships**: Belongs to `Task` and `AdapterConfiguration`; links to `PolicyDecision` for writeback.

**Validation Rules**:

- `syncStatus` is one of `never_synced`, `synced`, `local_newer`, `remote_newer`, `conflict`, `failed`, `disabled`.
- Writeback requires preview and policy approval.
- Adapter outage cannot make local task/runs unusable.

## Entity: Agent

**Fields**: `agentId`, `name`, `command`, `argsTemplate`, `roles`, `supportsNonInteractivePrompt`, `promptFlag`, `supportsMcp`, `mcpConfigStatus`, `supportsPlugins`, `supportsSkills`, `supportsSessionPersistence`, `supportsSubagents`, `supportsFleetOrMultiAgent`, `enabled`, `healthState`, `capabilityNotes`, `privacyNotes`, `projectAvailability`, `lastCheckedAt`.

**Relationships**: Starts `Run`; links to `AdapterConfiguration` and `CapabilityHealthRecord`.

**Validation Rules**:

- Agent command identity must be recorded before run start.
- Missing agents are `blocked` or `guided`, not fatal to other configured agents.
- GitHub Copilot CLI, when configured, uses standalone `copilot`, not `gh copilot`.
- GitHub Copilot CLI capability records explicitly model noninteractive prompt mode, MCP config, plugins, skills, session persistence, subagents, and multi-agent/fleet support rather than hiding them in notes.

## Entity: Run

**Fields**: `runId`, `taskId`, `projectId`, `agentId`, `commandIdentity`, `status`, `startedAt`, `updatedAt`, `endedAt`, `heartbeatAt`, `heartbeatState`, `worktreeId`, `contextPackId`, `eventStreamId`, `logArtifactIds`, `artifactIds`, `qualityGateIds`, `policyDecisionIds`, `summary`, `failureReason`, `finalOutcome`, `terminalStateRecordedAt`, `redactionStatus`.

**Relationships**: Belongs to `Task`, `Project`, `Agent`; owns `RunEvent`; links to `WorktreeAllocation`, `ContextPack`, `Artifact`, `QualityGateResult`, `PolicyDecision`.

**Lifecycle**:

```text
created -> starting -> running
running -> waiting_for_agent
running -> waiting_for_operator
running -> blocked
running -> cancel_requested
cancel_requested -> cancelled
running -> failed
running -> succeeded
succeeded -> review_required
succeeded -> completed
review_required -> completed
review_required -> blocked
blocked -> running
waiting_for_agent -> running
waiting_for_operator -> running
```

**Terminal statuses**: `cancelled`, `failed`, `completed`.

**Validation Rules**:

- A run reaches at most one terminal status.
- Cancellation records request, stop attempt, preserved artifacts, and resulting terminal state.
- Crash or stale heartbeat creates truthful status; Fulcrum does not assume clean workspace.
- Required gates and policy decisions must be linked before completion claims.

## Entity: RunEvent

**Fields**: `eventId`, `eventStreamId`, `projectId`, `taskId`, `runId`, `source`, `type`, `severity`, `timestamp`, `payloadSummary`, `payloadRef`, `redactionStatus`, `artifactRefs`, `policyDecisionRefs`, `correlationId`, `schemaVersion`.

**Relationships**: Belongs to `Run` or another operation; may link to `Artifact`, `PolicyDecision`, `QualityGateResult`.

**Validation Rules**:

- Append-only after write.
- Payload summary must be redacted.
- Event ordering is by timestamp plus monotonic sequence.

## Entity: ContextPack

**Fields**: `contextPackId`, `projectId`, `taskId`, `runId`, `status`, `generatedAt`, `budget`, `budgetUsed`, `laneSummaries`, `omissions`, `degradedLanes`, `freshness`, `exportRefs`, `policyDecisionIds`, `redactionStatus`.

**Relationships**: Owns `ContextItem`; links to `Task`, `Run`, `MemoryEntry`, `CodeEvidence`, `Artifact`, `QualityGateResult`, `GraphLink`.

**Validation Rules**:

- Every included item has provenance.
- Omitted or degraded lanes are visible.
- Export formats include markdown, JSON, agent prompt file, and local machine resource when requested.

## Entity: ContextItem

**Fields**: `contextItemId`, `contextPackId`, `lane`, `type`, `sourceRef`, `title`, `excerptRef`, `inclusionReason`, `freshness`, `evidenceType`, `confidence`, `limitation`, `toolIdentity`, `budgetEstimate`, `rank`, `redactionStatus`, `linkedRefs`.

**Validation Rules**:

- Exact, path, structural, repo map, broad package, memory-linked, agent-selected, quality-gate, and semantic evidence are distinguishable.
- Items from ignored or sensitive paths are excluded where possible.
- Semantic evidence cannot masquerade as exact line evidence.

## Entity: MemoryEntry

**Fields**: `memoryId`, `projectId`, `status`, `title`, `bodyRef`, `excerpt`, `sourceRefs`, `linkedTaskIds`, `linkedRunIds`, `linkedFileRefs`, `linkedSymbolRefs`, `linkedArtifactIds`, `backend`, `freshness`, `createdAt`, `updatedAt`, `approvedBy`, `exportStatus`, `redactionStatus`.

**Lifecycle**:

```text
draft -> active
active -> superseded
active -> stale
active -> archived
stale -> active
draft -> deleted
active -> deleted
```

**Validation Rules**:

- Permanent writes require policy approval unless scoped bypass exists.
- Approved memory cites raw sources or declares source unavailable.
- Linked missing files/tasks/runs mark memory `stale` or `needs_review`.

## Entity: CodeEvidence

**Fields**: `evidenceId`, `projectId`, `query`, `evidenceType`, `filePath`, `lineStart`, `lineEnd`, `symbol`, `sourceTool`, `ignoredPathStatus`, `freshness`, `rank`, `reason`, `durationMs`, `linkedContextItemIds`, `createdAt`, `staleAt`.

**Validation Rules**:

- Exact identifier, string, path, filename, error, symbol, import/export, structural, repo map, broad package, and semantic results are labeled.
- Stale results after delete/rename/rebuild are removed or marked stale.
- Ignored path exclusions are reflected in provenance.

## Entity: GraphLink

**Fields**: `linkId`, `sourceType`, `sourceId`, `targetType`, `targetId`, `relationshipType`, `evidenceRef`, `freshness`, `provenance`, `confidence`, `limitation`, `derived`, `rebuildSource`, `createdAt`, `updatedAt`.

**Validation Rules**:

- Graph links are rebuildable from canonical records or documented external source.
- Answers using stale or missing evidence must show limitations and next actions.

## Entity: WorktreeAllocation

**Fields**: `worktreeId`, `projectId`, `taskId`, `runId`, `path`, `branch`, `baseBranch`, `baseCommit`, `status`, `dirtyState`, `untrackedCount`, `uncommittedCount`, `unpushedCommitCount`, `conflictState`, `activeRunCount`, `cleanupEligibility`, `blockReason`, `lastCheckedAt`, `createdAt`, `cleanedAt`.

**Lifecycle**:

```text
requested -> allocated -> active -> review_ready
active -> blocked
review_ready -> merge_ready
merge_ready -> merged
allocated -> cleanup_requested
cleanup_requested -> cleanup_blocked
cleanup_requested -> cleaned
blocked -> active
```

**Validation Rules**:

- Cleanup is blocked for dirty files, untracked files, uncommitted changes, unpushed commits, unresolved conflicts, active runs, missing required artifacts, or missing approval.
- Existing workspace use requires policy-compliant reason.

## Entity: Artifact

**Fields**: `artifactId`, `projectId`, `taskId`, `runId`, `type`, `localRef`, `contentHash`, `sizeBytes`, `createdAt`, `summary`, `linkedRefs`, `retentionStatus`, `exportStatus`, `redactionStatus`, `sourceTool`.

**Validation Rules**:

- Raw logs are separate from summaries and external writebacks.
- Artifact paths stay under configured local state or approved project output locations.
- Sensitive artifacts require redaction status and export policy.

## Entity: QualityGateDefinition

**Fields**: `gateId`, `projectId`, `name`, `description`, `command`, `args`, `workingDirectoryPolicy`, `requiredFor`, `heavy`, `asyncRecommended`, `timeoutSeconds`, `enabled`, `createdAt`, `updatedAt`.

**Validation Rules**:

- Heavy gates are explicit or asynchronous.
- Commands are project-defined and policy-visible.
- Required gates list the readiness actions they block.

## Entity: QualityGateResult

**Fields**: `resultId`, `gateId`, `projectId`, `taskId`, `runId`, `status`, `startedAt`, `endedAt`, `durationMs`, `workingContext`, `exitCode`, `outputArtifactIds`, `parsedSummary`, `failureSummary`, `releaseExceptionId`, `redactionStatus`.

**Lifecycle**: `not_run`, `running`, `passed`, `failed`, `skipped`, `timeout`, `cancelled`, `degraded`.

**Validation Rules**:

- Failing, timed-out, cancelled, missing, or degraded required gates block readiness until passing evidence exists. Release exceptions are audited separately and do not count as passing readiness.
- Outputs are artifacts with redaction status.

## Entity: PolicyDecision

**Fields**: `decisionId`, `action`, `subjectType`, `subjectId`, `requester`, `projectId`, `taskId`, `runId`, `decision`, `reason`, `approvalRequired`, `approvedBy`, `approvalTime`, `bypassScope`, `expiresAt`, `previewRef`, `createdAt`, `auditEventId`.

**Decision values**: `allowed`, `denied`, `approval_required`, `approved`, `exception_recorded`.

**Validation Rules**:

- Destructive, externally visible, permanent-memory, remote-provider, sensitive-export, backup-purge, arbitrary-shell, and public-bind actions require decision records.
- Local-only mode denies remote actions unless operator changes policy.
- Bypass scope is explicit and auditable.

## Entity: CapabilityHealthRecord

**Fields**: `capabilityId`, `projectId`, `category`, `state`, `blocking`, `cause`, `nextAction`, `privacyStatus`, `affectedWorkflows`, `lastCheckedAt`, `source`, `freshness`, `detailsRef`.

**State values**: `managed`, `detected`, `guided`, `optional`, `blocked`, `degraded`, `disabled`, `unknown`.

**Validation Rules**:

- Doctor human and JSON outputs derive from the same records.
- Missing optional tools do not block unrelated core workflows.
- Remote-only checks become disabled or degraded when network is unavailable.

## Entity: AdapterConfiguration

**Fields**: `adapterId`, `category`, `name`, `enabled`, `ownershipBoundary`, `healthCheck`, `offlineBehavior`, `disablementBehavior`, `importExportStrategy`, `rebuildStrategy`, `credentialStatus`, `privacyNotes`, `networkRequired`, `lastHealthId`, `createdAt`, `updatedAt`.

**Validation Rules**:

- No adapter is a hidden source of truth for Fulcrum execution state.
- Credentials are never exposed in plaintext exports/logs/context.
- Disabled adapters preserve local canonical history.

## Entity: BackupManifest

**Fields**: `backupId`, `createdAt`, `sourceStateRoot`, `includedRecords`, `includedArtifacts`, `includedLogs`, `includedMemory`, `includedContextPacks`, `integrityStatus`, `restoreTarget`, `redactionStatus`, `purgeApprovalDecisionId`, `localRef`, `contentHash`.

**Validation Rules**:

- Backup includes canonical SQLite state and requested local files.
- Restore validates task/run/artifact/policy/context refs.
- Purge requires explicit confirmation.

## Entity: ExportRecord

**Fields**: `exportId`, `format`, `includedEntityClasses`, `createdAt`, `localRef`, `redactionStatus`, `provenanceCoverage`, `policyDecisionId`, `contentHash`.

**Validation Rules**:

- Export is local and machine-readable.
- Sensitive export is policy-gated.
- Provenance gaps are declared.

## Entity: ReviewQueueItem

**Fields**: `reviewItemId`, `type`, `projectId`, `taskId`, `runId`, `subjectId`, `status`, `reason`, `requiredAction`, `priority`, `createdAt`, `resolvedAt`.

**Validation Rules**:

- Completed or blocked agent work, gate failures, memory drafts, writeback previews, merge readiness, cleanup requests, and approvals create review items.
- Resolution links to policy decision, operator action, or recorded release exception.

## Entity: SyncWritebackRecord

**Fields**: `syncId`, `adapterId`, `taskId`, `mirrorId`, `operation`, `status`, `previewRef`, `payloadSummary`, `policyDecisionId`, `startedAt`, `endedAt`, `failureReason`, `remoteResultRef`.

**Validation Rules**:

- Externally visible writebacks require preview and approval.
- Local state remains canonical when sync fails.
- Remote payload summaries are redacted.

## Recommended Skill Calls

Use [skill-calls.md](skill-calls.md) as the full catalog. For data model work,
prioritize [$data-integrity-guardian](/home/mkh/.raise/profiles/vanilla/codex/skills/data-integrity-guardian/SKILL.md),
[$api-and-interface-design](/home/mkh/.raise/profiles/vanilla/codex/skills/api-and-interface-design/SKILL.md),
[$data-migration-expert](/home/mkh/.raise/profiles/vanilla/codex/skills/data-migration-expert/SKILL.md),
[$schema-drift-detector](/home/mkh/.raise/profiles/vanilla/codex/skills/schema-drift-detector/SKILL.md),
[$security-and-hardening](/home/mkh/.raise/profiles/vanilla/codex/skills/security-and-hardening/SKILL.md),
and [$document-review](/home/mkh/.raise/profiles/vanilla/codex/skills/document-review/SKILL.md).
