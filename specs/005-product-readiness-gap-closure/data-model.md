# Data Model: Product Readiness Gap Closure

## ComplianceRequirement

- `requirementId`: stable ID, e.g. `PRODUCT-009`, `SRS-FR-DOC-003`
- `sourceFile`: product/SRS file path
- `sourceLine`: source line or heading anchor
- `text`: requirement text
- `priority`: P1/P2/P3 or release band
- `supersededBy`: optional source-order reference
- `status`: implemented, partial, missing, deferred, superseded, mock_only, preview_only, documentation_only
- `implementationRefs`: code paths and symbols
- `testRefs`: test files and scenarios
- `evidenceRefs`: release evidence artifacts
- `nextAction`: exact remediation

## InstallTarget

- `targetId`: source, npm, pnpm-dlx, bun-binary
- `command`: install/start command
- `runtime`: Node, Bun, package runner
- `artifactPath`: generated package/binary when applicable
- `requiredCapabilities`: capability IDs
- `status`: managed, guided, blocked, degraded, optional
- `validationEvidence`: release evidence refs

## CanonicalMigrationRecord

- `migrationId`
- `sourceKind`: JSON work-state, setup-state, adapter-state, cache
- `sourcePath`
- `backupPath`
- `entityCounts`
- `checksum`
- `status`: pending, imported, verified, failed, rolled_back
- `startedAt`, `completedAt`
- `repairAction`

## CapabilityProbe

- `capabilityId`
- `name`
- `mode`: quick, deep, project, network
- `probeKind`: command, file, sqlite, api, env, config, policy
- `command` or `target`
- `blockingRule`
- `privacyStatus`
- `affectedWorkflows`
- `nextActionTemplate`

## AgentCertification

- `agentId`
- `command`
- `version`
- `authStatus`
- `enabled`
- `roles`
- `promptMechanisms`
- `mcpStatus`
- `hookStatus`
- `localOnlyBehavior`
- `acceptanceRunIds`
- `evidenceRefs`
- `status`

## AdapterCertification

- `adapterId`
- `category`
- `enabled`
- `testMode`
- `credentialStatus`
- `ownershipBoundary`
- `offlineBehavior`
- `disablementBehavior`
- `importExportStrategy`
- `rebuildStrategy`
- `privacyNotes`
- `healthEvidence`
- `status`

## InvalidationRecord

- `recordId`
- `derivedKind`: repo_map, repo_pack, code_evidence, memory_index, graph_projection, context_preview, ranking
- `sourceRefs`
- `repoHead`
- `workingTreeSignature`
- `ignoreConfigHash`
- `toolVersion`
- `generatedAt`
- `staleAt`
- `staleReason`
- `rebuildSource`

## ReleaseEvidencePack

- `releaseRunId`
- `startedAt`, `completedAt`
- `environment`
- `commands`
- `artifacts`
- `logs`
- `complianceSummary`
- `pass`
- `failures`
- `nextActions`
