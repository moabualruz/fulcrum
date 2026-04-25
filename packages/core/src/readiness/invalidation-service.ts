import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  InvalidationRecordSchema,
  makeId,
  SCHEMA_VERSION,
  type InvalidationRecord
} from "@fulcrum/shared";

export interface InvalidationRepositoryPort {
  saveInvalidationRecord(record: InvalidationRecord): InvalidationRecord;
  getInvalidationRecord(recordId: string): InvalidationRecord | undefined;
  listInvalidationRecords(derivedKind?: InvalidationRecord["derivedKind"]): InvalidationRecord[];
  markInvalidationRecordStale(
    recordId: string,
    staleAt: string,
    staleReason: string
  ): InvalidationRecord | undefined;
}

export interface InvalidationFingerprint {
  repoHead?: string;
  workingTreeSignature?: string;
  ignoreConfigHash?: string;
  toolVersion?: string;
}

export interface InvalidationStatus {
  total: number;
  fresh: number;
  stale: number;
  staleRecords: InvalidationRecord[];
  generatedKinds: InvalidationRecord["derivedKind"][];
  nextAction: string;
}

export class InvalidationService {
  constructor(private readonly repository: InvalidationRepositoryPort) {}

  recordGenerated(
    input: {
      derivedKind: InvalidationRecord["derivedKind"];
      rebuildSource: string;
      sourceRefs?: InvalidationRecord["sourceRefs"];
      recordId?: string;
      generatedAt?: string;
    } & InvalidationFingerprint
  ): InvalidationRecord {
    const generatedAt = input.generatedAt ?? new Date().toISOString();
    return this.repository.saveInvalidationRecord(
      InvalidationRecordSchema.parse({
        recordId:
          input.recordId ??
          makeId(
            "rebuild",
            `${input.derivedKind}:${input.rebuildSource}:${input.repoHead ?? ""}:${
              input.workingTreeSignature ?? ""
            }:${input.ignoreConfigHash ?? ""}`
          ),
        derivedKind: input.derivedKind,
        sourceRefs: input.sourceRefs ?? [],
        repoHead: input.repoHead,
        workingTreeSignature: input.workingTreeSignature,
        ignoreConfigHash: input.ignoreConfigHash,
        toolVersion: input.toolVersion,
        generatedAt,
        staleAt: undefined,
        staleReason: undefined,
        rebuildSource: input.rebuildSource,
        schemaVersion: SCHEMA_VERSION
      })
    );
  }

  markStale(recordId: string, reason: string, staleAt = new Date().toISOString()) {
    return this.repository.markInvalidationRecordStale(recordId, staleAt, reason);
  }

  markMatchingStale(input: {
    derivedKinds?: InvalidationRecord["derivedKind"][];
    sourceUriIncludes?: string;
    rebuildSourceIncludes?: string;
    reason: string;
    staleAt?: string;
  }): InvalidationRecord[] {
    const staleAt = input.staleAt ?? new Date().toISOString();
    const kinds = new Set(input.derivedKinds ?? []);
    return this.repository
      .listInvalidationRecords()
      .filter((record) => !record.staleAt)
      .filter((record) => kinds.size === 0 || kinds.has(record.derivedKind))
      .filter(
        (record) =>
          !input.sourceUriIncludes ||
          record.sourceRefs.some((ref) => ref.uri.includes(input.sourceUriIncludes!))
      )
      .filter(
        (record) =>
          !input.rebuildSourceIncludes || record.rebuildSource.includes(input.rebuildSourceIncludes)
      )
      .map((record) =>
        this.repository.markInvalidationRecordStale(record.recordId, staleAt, input.reason)
      )
      .filter((record): record is InvalidationRecord => Boolean(record));
  }

  invalidateChanged(
    input: {
      derivedKinds?: InvalidationRecord["derivedKind"][];
      reason?: string;
    } & InvalidationFingerprint
  ): InvalidationRecord[] {
    const staleAt = new Date().toISOString();
    return this.repository
      .listInvalidationRecords()
      .filter((record) => !record.staleAt)
      .filter((record) => !input.derivedKinds || input.derivedKinds.includes(record.derivedKind))
      .filter(
        (record) =>
          fingerprintChanged(record, input.repoHead, "repoHead") ||
          fingerprintChanged(record, input.workingTreeSignature, "workingTreeSignature") ||
          fingerprintChanged(record, input.ignoreConfigHash, "ignoreConfigHash") ||
          fingerprintChanged(record, input.toolVersion, "toolVersion")
      )
      .map((record) =>
        this.repository.markInvalidationRecordStale(
          record.recordId,
          staleAt,
          input.reason ?? "Source fingerprint changed."
        )
      )
      .filter((record): record is InvalidationRecord => Boolean(record));
  }

  status(derivedKind?: InvalidationRecord["derivedKind"]): InvalidationStatus {
    const records = this.repository.listInvalidationRecords(derivedKind);
    const staleRecords = records.filter((record) => Boolean(record.staleAt));
    return {
      total: records.length,
      fresh: records.length - staleRecords.length,
      stale: staleRecords.length,
      staleRecords,
      generatedKinds: [...new Set(records.map((record) => record.derivedKind))].sort(),
      nextAction:
        staleRecords.length > 0
          ? "Run graph rebuild or regenerate affected cache before relying on derived data."
          : "Graph/cache invalidation records are current."
    };
  }
}

export class MemoryInvalidationRepository implements InvalidationRepositoryPort {
  private readonly records = new Map<string, InvalidationRecord>();

  saveInvalidationRecord(record: InvalidationRecord): InvalidationRecord {
    this.records.set(record.recordId, record);
    return record;
  }

  getInvalidationRecord(recordId: string): InvalidationRecord | undefined {
    return this.records.get(recordId);
  }

  listInvalidationRecords(derivedKind?: InvalidationRecord["derivedKind"]): InvalidationRecord[] {
    return [...this.records.values()]
      .filter((record) => !derivedKind || record.derivedKind === derivedKind)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  }

  markInvalidationRecordStale(
    recordId: string,
    staleAt: string,
    staleReason: string
  ): InvalidationRecord | undefined {
    const current = this.records.get(recordId);
    if (!current) return undefined;
    const next = current.staleAt ? current : { ...current, staleAt, staleReason };
    this.records.set(recordId, next);
    return next;
  }
}

export function collectRepoFingerprint(
  rootPath: string,
  toolVersion = "fulcrum-core"
): InvalidationFingerprint {
  return {
    repoHead: gitHead(rootPath),
    workingTreeSignature: directorySignature(rootPath),
    ignoreConfigHash: ignoreConfigHash(rootPath),
    toolVersion
  };
}

function fingerprintChanged(
  record: InvalidationRecord,
  next: string | undefined,
  key: keyof InvalidationFingerprint
): boolean {
  return record[key] !== next && (record[key] !== undefined || next !== undefined);
}

function gitHead(rootPath: string): string | undefined {
  try {
    return execFileSync("git", ["-C", rootPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return undefined;
  }
}

function ignoreConfigHash(rootPath: string): string | undefined {
  const files = [".gitignore", ".fulcrumignore"].map((file) => path.join(rootPath, file));
  const hash = createHash("sha256");
  let found = false;
  for (const file of files) {
    if (!existsSync(file)) continue;
    found = true;
    hash.update(file);
    hash.update(readFileSync(file));
  }
  return found ? hash.digest("hex") : undefined;
}

function directorySignature(rootPath: string): string | undefined {
  if (!existsSync(rootPath)) return undefined;
  const hash = createHash("sha256");
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      if (entry === ".git" || entry === "node_modules") continue;
      const fullPath = path.join(dir, entry);
      const relative = path.relative(rootPath, fullPath);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        visit(fullPath);
      } else if (stats.isFile()) {
        hash.update(relative);
        hash.update(String(stats.size));
        hash.update(String(Math.trunc(stats.mtimeMs)));
      }
    }
  };
  visit(rootPath);
  return hash.digest("hex");
}
