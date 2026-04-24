import type Database from "better-sqlite3";
import {
  AdapterCertificationSchema,
  AgentCertificationSchema,
  CapabilityProbeSchema,
  CanonicalMigrationRecordSchema,
  ComplianceRequirementSchema,
  InstallTargetSchema,
  InvalidationRecordSchema,
  ReleaseEvidencePackSchema,
  type AdapterCertification,
  type AgentCertification,
  type CapabilityProbe,
  type CanonicalMigrationRecord,
  type ComplianceRequirement,
  type InstallTarget,
  type InvalidationRecord,
  type ReleaseEvidencePack
} from "@fulcrum/shared";

type Row = Record<string, unknown>;

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  return JSON.parse(String(value)) as T;
}

function withTimestamps<T extends { createdAt?: string; updatedAt?: string }>(value: T): T {
  const now = new Date().toISOString();
  return { ...value, createdAt: value.createdAt ?? now, updatedAt: value.updatedAt ?? now };
}

function complianceFromRow(row: Row): ComplianceRequirement {
  return ComplianceRequirementSchema.parse({
    requirementId: row.requirement_id,
    sourceFile: row.source_file,
    sourceLine: row.source_line,
    text: row.text,
    priority: row.priority,
    supersededBy: row.superseded_by ?? undefined,
    status: row.status,
    implementationRefs: parseJson(row.implementation_refs_json, []),
    testRefs: parseJson(row.test_refs_json, []),
    evidenceRefs: parseJson(row.evidence_refs_json, []),
    nextAction: row.next_action,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

function installTargetFromRow(row: Row): InstallTarget {
  return InstallTargetSchema.parse({
    targetId: row.target_id,
    command: row.command,
    runtime: row.runtime,
    artifactPath: row.artifact_path ?? undefined,
    requiredCapabilities: parseJson(row.required_capabilities_json, []),
    status: row.status,
    validationEvidence: parseJson(row.validation_evidence_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

function migrationRecordFromRow(row: Row): CanonicalMigrationRecord {
  return CanonicalMigrationRecordSchema.parse({
    migrationId: row.migration_id,
    sourceKind: row.source_kind,
    sourcePath: row.source_path,
    backupPath: row.backup_path ?? undefined,
    entityCounts: parseJson(row.entity_counts_json, {}),
    checksum: row.checksum,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    repairAction: row.repair_action ?? undefined,
    schemaVersion: row.schema_version
  });
}

function capabilityProbeFromRow(row: Row): CapabilityProbe {
  return CapabilityProbeSchema.parse({
    capabilityId: row.capability_id,
    name: row.name,
    mode: row.mode,
    probeKind: row.probe_kind,
    command: row.command ?? undefined,
    target: row.target ?? undefined,
    blockingRule: row.blocking_rule,
    privacyStatus: row.privacy_status,
    affectedWorkflows: parseJson(row.affected_workflows_json, []),
    nextActionTemplate: row.next_action_template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

function agentCertificationFromRow(row: Row): AgentCertification {
  return AgentCertificationSchema.parse({
    agentId: row.agent_id,
    command: row.command,
    version: row.version ?? undefined,
    authStatus: row.auth_status,
    enabled: Boolean(row.enabled),
    roles: parseJson(row.roles_json, []),
    promptMechanisms: parseJson(row.prompt_mechanisms_json, []),
    mcpStatus: row.mcp_status,
    hookStatus: row.hook_status,
    localOnlyBehavior: row.local_only_behavior,
    acceptanceRunIds: parseJson(row.acceptance_run_ids_json, []),
    evidenceRefs: parseJson(row.evidence_refs_json, []),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

function adapterCertificationFromRow(row: Row): AdapterCertification {
  return AdapterCertificationSchema.parse({
    adapterId: row.adapter_id,
    category: row.category,
    enabled: Boolean(row.enabled),
    testMode: row.test_mode,
    credentialStatus: row.credential_status,
    ownershipBoundary: row.ownership_boundary,
    offlineBehavior: row.offline_behavior,
    disablementBehavior: row.disablement_behavior,
    importExportStrategy: row.import_export_strategy,
    rebuildStrategy: row.rebuild_strategy,
    privacyNotes: row.privacy_notes,
    healthEvidence: parseJson(row.health_evidence_json, []),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

function invalidationRecordFromRow(row: Row): InvalidationRecord {
  return InvalidationRecordSchema.parse({
    recordId: row.record_id,
    derivedKind: row.derived_kind,
    sourceRefs: parseJson(row.source_refs_json, []),
    repoHead: row.repo_head ?? undefined,
    workingTreeSignature: row.working_tree_signature ?? undefined,
    ignoreConfigHash: row.ignore_config_hash ?? undefined,
    toolVersion: row.tool_version ?? undefined,
    generatedAt: row.generated_at,
    staleAt: row.stale_at ?? undefined,
    staleReason: row.stale_reason ?? undefined,
    rebuildSource: row.rebuild_source,
    schemaVersion: row.schema_version
  });
}

function releaseEvidencePackFromRow(row: Row): ReleaseEvidencePack {
  return ReleaseEvidencePackSchema.parse({
    releaseRunId: row.release_run_id,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    environment: parseJson(row.environment_json, {}),
    commands: parseJson(row.commands_json, []),
    artifacts: parseJson(row.artifacts_json, []),
    logs: parseJson(row.logs_json, []),
    complianceSummary: parseJson(row.compliance_summary_json, {}),
    pass: Boolean(row.pass),
    failures: parseJson(row.failures_json, []),
    nextActions: parseJson(row.next_actions_json, []),
    redactionStatus: row.redaction_status,
    schemaVersion: row.schema_version
  });
}

export class ReadinessRepository {
  constructor(private readonly db: Database.Database) {}

  saveComplianceRequirement(requirement: ComplianceRequirement): ComplianceRequirement {
    const parsed = ComplianceRequirementSchema.parse(withTimestamps(requirement));
    this.db
      .prepare(
        `INSERT INTO compliance_requirements (
          requirement_id, source_file, source_line, text, priority, superseded_by, status,
          implementation_refs_json, test_refs_json, evidence_refs_json, next_action,
          created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(requirement_id) DO UPDATE SET
          source_file = excluded.source_file,
          source_line = excluded.source_line,
          text = excluded.text,
          priority = excluded.priority,
          superseded_by = excluded.superseded_by,
          status = excluded.status,
          implementation_refs_json = excluded.implementation_refs_json,
          test_refs_json = excluded.test_refs_json,
          evidence_refs_json = excluded.evidence_refs_json,
          next_action = excluded.next_action,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.requirementId,
        parsed.sourceFile,
        String(parsed.sourceLine),
        parsed.text,
        parsed.priority,
        parsed.supersededBy ?? null,
        parsed.status,
        json(parsed.implementationRefs),
        json(parsed.testRefs),
        json(parsed.evidenceRefs),
        parsed.nextAction,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  getComplianceRequirement(requirementId: string): ComplianceRequirement | undefined {
    const row = this.db
      .prepare("SELECT * FROM compliance_requirements WHERE requirement_id = ?")
      .get(requirementId) as Row | undefined;
    return row ? complianceFromRow(row) : undefined;
  }

  listComplianceRequirements(): ComplianceRequirement[] {
    return this.db
      .prepare("SELECT * FROM compliance_requirements ORDER BY source_file ASC, requirement_id ASC")
      .all()
      .map((row) => complianceFromRow(row as Row));
  }

  saveInstallTarget(target: InstallTarget): InstallTarget {
    const parsed = InstallTargetSchema.parse(withTimestamps(target));
    this.db
      .prepare(
        `INSERT INTO install_targets (
          target_id, command, runtime, artifact_path, required_capabilities_json,
          status, validation_evidence_json, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(target_id) DO UPDATE SET
          command = excluded.command,
          runtime = excluded.runtime,
          artifact_path = excluded.artifact_path,
          required_capabilities_json = excluded.required_capabilities_json,
          status = excluded.status,
          validation_evidence_json = excluded.validation_evidence_json,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.targetId,
        parsed.command,
        parsed.runtime,
        parsed.artifactPath ?? null,
        json(parsed.requiredCapabilities),
        parsed.status,
        json(parsed.validationEvidence),
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  listInstallTargets(): InstallTarget[] {
    return this.db
      .prepare("SELECT * FROM install_targets ORDER BY target_id ASC")
      .all()
      .map((row) => installTargetFromRow(row as Row));
  }

  saveMigrationRecord(record: CanonicalMigrationRecord): CanonicalMigrationRecord {
    const parsed = CanonicalMigrationRecordSchema.parse(record);
    this.db
      .prepare(
        `INSERT INTO canonical_migration_records (
          migration_id, source_kind, source_path, backup_path, entity_counts_json, checksum,
          status, started_at, completed_at, repair_action, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(migration_id) DO UPDATE SET
          backup_path = excluded.backup_path,
          entity_counts_json = excluded.entity_counts_json,
          checksum = excluded.checksum,
          status = excluded.status,
          completed_at = excluded.completed_at,
          repair_action = excluded.repair_action,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.migrationId,
        parsed.sourceKind,
        parsed.sourcePath,
        parsed.backupPath ?? null,
        json(parsed.entityCounts),
        parsed.checksum,
        parsed.status,
        parsed.startedAt,
        parsed.completedAt ?? null,
        parsed.repairAction ?? null,
        parsed.schemaVersion
      );
    return parsed;
  }

  listMigrationRecords(): CanonicalMigrationRecord[] {
    return this.db
      .prepare("SELECT * FROM canonical_migration_records ORDER BY started_at DESC")
      .all()
      .map((row) => migrationRecordFromRow(row as Row));
  }

  saveCapabilityProbe(probe: CapabilityProbe): CapabilityProbe {
    const parsed = CapabilityProbeSchema.parse(withTimestamps(probe));
    this.db
      .prepare(
        `INSERT INTO capability_probes (
          capability_id, name, mode, probe_kind, command, target, blocking_rule, privacy_status,
          affected_workflows_json, next_action_template, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(capability_id) DO UPDATE SET
          name = excluded.name,
          mode = excluded.mode,
          probe_kind = excluded.probe_kind,
          command = excluded.command,
          target = excluded.target,
          blocking_rule = excluded.blocking_rule,
          privacy_status = excluded.privacy_status,
          affected_workflows_json = excluded.affected_workflows_json,
          next_action_template = excluded.next_action_template,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.capabilityId,
        parsed.name,
        parsed.mode,
        parsed.probeKind,
        parsed.command ?? null,
        parsed.target ?? null,
        parsed.blockingRule,
        parsed.privacyStatus,
        json(parsed.affectedWorkflows),
        parsed.nextActionTemplate,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  listCapabilityProbes(mode?: CapabilityProbe["mode"]): CapabilityProbe[] {
    const statement = mode
      ? this.db.prepare("SELECT * FROM capability_probes WHERE mode = ? ORDER BY capability_id ASC")
      : this.db.prepare("SELECT * FROM capability_probes ORDER BY capability_id ASC");
    return (mode ? statement.all(mode) : statement.all()).map((row) =>
      capabilityProbeFromRow(row as Row)
    );
  }

  saveAgentCertification(certification: AgentCertification): AgentCertification {
    const parsed = AgentCertificationSchema.parse(withTimestamps(certification));
    this.db
      .prepare(
        `INSERT INTO agent_certifications (
          agent_id, command, version, auth_status, enabled, roles_json, prompt_mechanisms_json,
          mcp_status, hook_status, local_only_behavior, acceptance_run_ids_json,
          evidence_refs_json, status, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(agent_id) DO UPDATE SET
          command = excluded.command,
          version = excluded.version,
          auth_status = excluded.auth_status,
          enabled = excluded.enabled,
          roles_json = excluded.roles_json,
          prompt_mechanisms_json = excluded.prompt_mechanisms_json,
          mcp_status = excluded.mcp_status,
          hook_status = excluded.hook_status,
          local_only_behavior = excluded.local_only_behavior,
          acceptance_run_ids_json = excluded.acceptance_run_ids_json,
          evidence_refs_json = excluded.evidence_refs_json,
          status = excluded.status,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.agentId,
        parsed.command,
        parsed.version ?? null,
        parsed.authStatus,
        parsed.enabled ? 1 : 0,
        json(parsed.roles),
        json(parsed.promptMechanisms),
        parsed.mcpStatus,
        parsed.hookStatus,
        parsed.localOnlyBehavior,
        json(parsed.acceptanceRunIds),
        json(parsed.evidenceRefs),
        parsed.status,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  listAgentCertifications(): AgentCertification[] {
    return this.db
      .prepare("SELECT * FROM agent_certifications ORDER BY agent_id ASC")
      .all()
      .map((row) => agentCertificationFromRow(row as Row));
  }

  saveAdapterCertification(certification: AdapterCertification): AdapterCertification {
    const parsed = AdapterCertificationSchema.parse(withTimestamps(certification));
    this.db
      .prepare(
        `INSERT INTO adapter_certifications (
          adapter_id, category, enabled, test_mode, credential_status, ownership_boundary,
          offline_behavior, disablement_behavior, import_export_strategy, rebuild_strategy,
          privacy_notes, health_evidence_json, status, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(adapter_id) DO UPDATE SET
          category = excluded.category,
          enabled = excluded.enabled,
          test_mode = excluded.test_mode,
          credential_status = excluded.credential_status,
          ownership_boundary = excluded.ownership_boundary,
          offline_behavior = excluded.offline_behavior,
          disablement_behavior = excluded.disablement_behavior,
          import_export_strategy = excluded.import_export_strategy,
          rebuild_strategy = excluded.rebuild_strategy,
          privacy_notes = excluded.privacy_notes,
          health_evidence_json = excluded.health_evidence_json,
          status = excluded.status,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.adapterId,
        parsed.category,
        parsed.enabled ? 1 : 0,
        parsed.testMode,
        parsed.credentialStatus,
        parsed.ownershipBoundary,
        parsed.offlineBehavior,
        parsed.disablementBehavior,
        parsed.importExportStrategy,
        parsed.rebuildStrategy,
        parsed.privacyNotes,
        json(parsed.healthEvidence),
        parsed.status,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  listAdapterCertifications(): AdapterCertification[] {
    return this.db
      .prepare("SELECT * FROM adapter_certifications ORDER BY category ASC, adapter_id ASC")
      .all()
      .map((row) => adapterCertificationFromRow(row as Row));
  }

  saveInvalidationRecord(record: InvalidationRecord): InvalidationRecord {
    const parsed = InvalidationRecordSchema.parse(record);
    this.db
      .prepare(
        `INSERT INTO invalidation_records (
          record_id, derived_kind, source_refs_json, repo_head, working_tree_signature,
          ignore_config_hash, tool_version, generated_at, stale_at, stale_reason,
          rebuild_source, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(record_id) DO UPDATE SET
          source_refs_json = excluded.source_refs_json,
          repo_head = excluded.repo_head,
          working_tree_signature = excluded.working_tree_signature,
          ignore_config_hash = excluded.ignore_config_hash,
          tool_version = excluded.tool_version,
          generated_at = excluded.generated_at,
          stale_at = excluded.stale_at,
          stale_reason = excluded.stale_reason,
          rebuild_source = excluded.rebuild_source,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.recordId,
        parsed.derivedKind,
        json(parsed.sourceRefs),
        parsed.repoHead ?? null,
        parsed.workingTreeSignature ?? null,
        parsed.ignoreConfigHash ?? null,
        parsed.toolVersion ?? null,
        parsed.generatedAt,
        parsed.staleAt ?? null,
        parsed.staleReason ?? null,
        parsed.rebuildSource,
        parsed.schemaVersion
      );
    return parsed;
  }

  listInvalidationRecords(derivedKind?: InvalidationRecord["derivedKind"]): InvalidationRecord[] {
    const statement = derivedKind
      ? this.db.prepare(
          "SELECT * FROM invalidation_records WHERE derived_kind = ? ORDER BY generated_at DESC"
        )
      : this.db.prepare("SELECT * FROM invalidation_records ORDER BY generated_at DESC");
    return (derivedKind ? statement.all(derivedKind) : statement.all()).map((row) =>
      invalidationRecordFromRow(row as Row)
    );
  }

  getInvalidationRecord(recordId: string): InvalidationRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM invalidation_records WHERE record_id = ?")
      .get(recordId) as Row | undefined;
    return row ? invalidationRecordFromRow(row) : undefined;
  }

  markInvalidationRecordStale(
    recordId: string,
    staleAt: string,
    staleReason: string
  ): InvalidationRecord | undefined {
    this.db
      .prepare(
        `UPDATE invalidation_records
         SET stale_at = ?, stale_reason = ?
         WHERE record_id = ? AND stale_at IS NULL`
      )
      .run(staleAt, staleReason, recordId);
    return this.getInvalidationRecord(recordId);
  }

  saveReleaseEvidencePack(pack: ReleaseEvidencePack): ReleaseEvidencePack {
    const parsed = ReleaseEvidencePackSchema.parse(pack);
    this.db
      .prepare(
        `INSERT INTO release_evidence_packs (
          release_run_id, started_at, completed_at, environment_json, commands_json,
          artifacts_json, logs_json, compliance_summary_json, pass, failures_json,
          next_actions_json, redaction_status, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(release_run_id) DO UPDATE SET
          completed_at = excluded.completed_at,
          environment_json = excluded.environment_json,
          commands_json = excluded.commands_json,
          artifacts_json = excluded.artifacts_json,
          logs_json = excluded.logs_json,
          compliance_summary_json = excluded.compliance_summary_json,
          pass = excluded.pass,
          failures_json = excluded.failures_json,
          next_actions_json = excluded.next_actions_json,
          redaction_status = excluded.redaction_status,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.releaseRunId,
        parsed.startedAt,
        parsed.completedAt ?? null,
        json(parsed.environment),
        json(parsed.commands),
        json(parsed.artifacts),
        json(parsed.logs),
        json(parsed.complianceSummary),
        parsed.pass ? 1 : 0,
        json(parsed.failures),
        json(parsed.nextActions),
        parsed.redactionStatus,
        parsed.schemaVersion
      );
    return parsed;
  }

  listReleaseEvidencePacks(): ReleaseEvidencePack[] {
    return this.db
      .prepare("SELECT * FROM release_evidence_packs ORDER BY started_at DESC")
      .all()
      .map((row) => releaseEvidencePackFromRow(row as Row));
  }
}
