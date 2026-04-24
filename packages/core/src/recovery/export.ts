import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { redactText } from "@fulcrum/policy";
import {
  makeId,
  SCHEMA_VERSION,
  type ExportRecord,
  type RedactionStatus,
  type SourceRef
} from "@fulcrum/shared";
import { hashObject } from "./backup.js";

export interface ExportRepositoryPort {
  save(record: ExportRecord): ExportRecord;
  list(): ExportRecord[];
}

export interface RecoveryExportRequest {
  outputRoot: string;
  format: "json" | "jsonl";
  entityClasses: string[];
  stateRoot?: string;
  records?: Record<string, unknown[]>;
  provenance?: Record<string, SourceRef[]>;
  policyDecisionId?: string;
}

export interface RecoveryExportPreview {
  format: "json" | "jsonl";
  outputRoot: string;
  includedEntityClasses: string[];
  recordCounts: Record<string, number>;
  provenanceCoverage: "complete" | "partial" | "none";
  redactionStatus: RedactionStatus;
  requiresPolicyApproval: boolean;
  policyAction: "sensitive_export";
  guarantees: string[];
}

export class RecoveryExportService {
  constructor(private readonly repository: ExportRepositoryPort) {}

  preview(request: RecoveryExportRequest): RecoveryExportPreview {
    const prepared = prepareExport(request);
    return {
      format: request.format,
      outputRoot: request.outputRoot,
      includedEntityClasses: request.entityClasses,
      recordCounts: Object.fromEntries(
        Object.entries(prepared.records).map(([entityClass, records]) => [
          entityClass,
          records.length
        ])
      ),
      provenanceCoverage: prepared.provenanceCoverage,
      redactionStatus: prepared.redactionStatus,
      requiresPolicyApproval: true,
      policyAction: "sensitive_export",
      guarantees: [
        "Export content is written only to the requested local output root.",
        "Known secret patterns are redacted before the export file is written.",
        "Each exported local-state record includes a source reference when available."
      ]
    };
  }

  create(request: RecoveryExportRequest): ExportRecord {
    const createdAt = new Date().toISOString();
    const exportId = makeId("export", `${request.format}-${createdAt}`);
    mkdirSync(request.outputRoot, { recursive: true });
    const localRef = join(request.outputRoot, `${exportId}.${request.format}`);
    const prepared = prepareExport(request);
    const body = {
      schemaVersion: SCHEMA_VERSION,
      exportId,
      createdAt,
      includedEntityClasses: request.entityClasses,
      provenanceCoverage: prepared.provenanceCoverage,
      redactionStatus: prepared.redactionStatus,
      records: prepared.records,
      provenance: prepared.provenance
    };
    const rawContent =
      request.format === "jsonl"
        ? Object.entries(prepared.records)
            .flatMap(([entityClass, records]) => {
              const sourceRefs = prepared.provenance[entityClass] ?? [];
              return records.map((record, index) =>
                JSON.stringify({
                  schemaVersion: SCHEMA_VERSION,
                  exportId,
                  createdAt,
                  entityClass,
                  sourceRef: sourceRefs[index],
                  redactionStatus: prepared.redactionStatus,
                  record
                })
              );
            })
            .join("\n")
        : JSON.stringify(body, null, 2);
    const content = rawContent;
    writeFileSync(localRef, content);
    return this.repository.save({
      exportId,
      format: request.format,
      includedEntityClasses: request.entityClasses,
      createdAt,
      localRef,
      redactionStatus: prepared.redactionStatus,
      provenanceCoverage: prepared.provenanceCoverage,
      policyDecisionId: request.policyDecisionId,
      contentHash: hashObject(content),
      schemaVersion: SCHEMA_VERSION
    });
  }
}

function prepareExport(request: RecoveryExportRequest): {
  records: Record<string, unknown[]>;
  provenance: Record<string, SourceRef[]>;
  provenanceCoverage: "complete" | "partial" | "none";
  redactionStatus: RedactionStatus;
} {
  const fromState = request.stateRoot
    ? collectStateRecords(request.stateRoot, request.entityClasses)
    : { records: {}, provenance: {} };
  const records = request.records ?? fromState.records;
  const provenance = request.provenance ?? fromState.provenance;
  const totalRecords = Object.values(records).reduce((sum, items) => sum + items.length, 0);
  const totalProvenance = Object.entries(records).reduce(
    (sum, [entityClass, items]) =>
      sum + Math.min(items.length, provenance[entityClass]?.length ?? 0),
    0
  );
  const redactedRecords = redactStructured(records) as {
    value: Record<string, unknown[]>;
    redacted: boolean;
  };
  const redactedProvenance = redactStructured(provenance) as {
    value: Record<string, SourceRef[]>;
    redacted: boolean;
  };
  const redacted = redactedRecords.redacted || redactedProvenance.redacted;
  return {
    records: redactedRecords.value,
    provenance: redactedProvenance.value,
    provenanceCoverage:
      totalRecords === 0 ? "none" : totalProvenance === totalRecords ? "complete" : "partial",
    redactionStatus: totalRecords === 0 ? "not_applicable" : redacted ? "redacted" : "not_redacted"
  };
}

function redactStructured(value: unknown): { value: unknown; redacted: boolean } {
  if (typeof value === "string") {
    const result = redactText(value);
    return { value: result.text, redacted: result.redacted };
  }
  if (Array.isArray(value)) {
    let redacted = false;
    const items = value.map((item) => {
      const result = redactStructured(item);
      redacted ||= result.redacted;
      return result.value;
    });
    return { value: items, redacted };
  }
  if (value && typeof value === "object") {
    let redacted = false;
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const result = redactStructured(item);
      redacted ||= result.redacted;
      return [key, result.value];
    });
    return { value: Object.fromEntries(entries), redacted };
  }
  return { value, redacted: false };
}

function collectStateRecords(
  stateRoot: string,
  entityClasses: string[]
): { records: Record<string, unknown[]>; provenance: Record<string, SourceRef[]> } {
  const workStatePath = join(stateRoot, "work-state.json");
  const state = readJsonRecord(workStatePath);
  const records: Record<string, unknown[]> = {};
  const provenance: Record<string, SourceRef[]> = {};
  for (const entityClass of entityClasses) {
    const items = recordsForEntityClass(stateRoot, state, entityClass);
    records[entityClass] = items.records;
    provenance[entityClass] = items.provenance.length
      ? items.provenance
      : items.records.map((_, index) => ({
          type: "local_state",
          uri: `${workStatePath}#/${entityClass}/${index}`
        }));
  }
  return { records, provenance };
}

function recordsForEntityClass(
  stateRoot: string,
  state: Record<string, unknown>,
  entityClass: string
): { records: unknown[]; provenance: SourceRef[] } {
  if (entityClass === "artifacts") {
    return artifactRecords(stateRoot);
  }
  const workStateKey = workStateKeys[entityClass] ?? entityClass;
  const records = Array.isArray(state[workStateKey]) ? (state[workStateKey] as unknown[]) : [];
  return {
    records,
    provenance: records.map((_, index) => ({
      type: "local_state",
      uri: `${join(stateRoot, "work-state.json")}#/${workStateKey}/${index}`
    }))
  };
}

function artifactRecords(stateRoot: string): { records: unknown[]; provenance: SourceRef[] } {
  const artifactRoot = join(stateRoot, "artifacts");
  try {
    const records = readdirSync(artifactRoot).map((entry) => {
      const uri = join(artifactRoot, entry);
      const stat = statSync(uri);
      return { type: "artifact", uri, sizeBytes: stat.size };
    });
    return {
      records,
      provenance: records.map((record) => ({ type: "artifact", uri: record.uri }))
    };
  } catch {
    return { records: [], provenance: [] };
  }
}

function readJsonRecord(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const workStateKeys: Record<string, string> = {
  memory: "memoryEntries",
  memories: "memoryEntries",
  context: "contextPacks",
  context_packs: "contextPacks",
  context_items: "contextItems",
  code: "codeEvidence",
  code_evidence: "codeEvidence",
  worktrees: "worktrees",
  quality: "qualityGateResults",
  quality_gates: "qualityGateResults",
  quality_gate_results: "qualityGateResults",
  external_work_items: "externalWorkItemMirrors",
  policy_decisions: "runEvents",
  policies: "runEvents"
};
