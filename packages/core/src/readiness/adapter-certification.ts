import type { AdapterCertification } from "@fulcrum/shared";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AdapterRegistryEntry, AdapterRegistryService } from "../adapters/registry.js";

export interface AdapterCertificationEvidence {
  evidenceRoot?: string;
  healthEvidencePrefix?: string;
}

export async function certifyAdapters(
  registry: AdapterRegistryService,
  evidence: AdapterCertificationEvidence = {}
): Promise<AdapterCertification[]> {
  const entries = await registry.listHealth();
  return entries.map((entry) => {
    if (evidence.evidenceRoot) {
      writeHealthEvidence(entry, evidence.evidenceRoot, evidence.healthEvidencePrefix);
    }
    return certifyAdapterEntry(entry, evidence);
  });
}

export function certifyAdapterEntry(
  entry: AdapterRegistryEntry,
  evidence: AdapterCertificationEvidence = {}
): AdapterCertification {
  const credentialStatus = normalizeCredential(entry.metadata.credentialStatus);
  const status = certificationStatus(entry, credentialStatus);
  const now = new Date().toISOString();
  return {
    adapterId: entry.metadata.adapterId,
    category: entry.metadata.category,
    enabled: entry.metadata.enabled,
    testMode: testMode(entry),
    credentialStatus,
    ownershipBoundary: entry.metadata.ownershipBoundary,
    offlineBehavior: entry.metadata.offlineBehavior,
    disablementBehavior: entry.metadata.disablementBehavior,
    importExportStrategy: entry.metadata.importExportStrategy,
    rebuildStrategy: entry.metadata.rebuildStrategy,
    privacyNotes: entry.metadata.privacyNotes,
    healthEvidence: evidence.evidenceRoot
      ? [`${evidence.healthEvidencePrefix ?? "adapters"}/${entry.metadata.adapterId}-health.json`]
      : [],
    status,
    createdAt: now,
    updatedAt: now,
    schemaVersion: "1.0"
  };
}

function writeHealthEvidence(
  entry: AdapterRegistryEntry,
  evidenceRoot: string,
  healthEvidencePrefix?: string
): void {
  const relativePath = `${healthEvidencePrefix ?? "adapters"}/${entry.metadata.adapterId}-health.json`;
  const absolutePath = path.join(evidenceRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(
    absolutePath,
    JSON.stringify(
      {
        schemaVersion: "1.0",
        metadata: entry.metadata,
        health: entry.health,
        generatedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
}

function certificationStatus(
  entry: AdapterRegistryEntry,
  credentialStatus: AdapterCertification["credentialStatus"]
): AdapterCertification["status"] {
  if (!entry.metadata.enabled || entry.health.state === "disabled") {
    return "optional";
  }
  if (entry.health.blocking || credentialStatus === "invalid") {
    return "blocked";
  }
  if (entry.health.state === "managed" || entry.health.state === "detected") {
    return "certified";
  }
  if (entry.health.state === "degraded" || entry.health.state === "guided") {
    return "degraded";
  }
  return "unknown";
}

function testMode(entry: AdapterRegistryEntry): AdapterCertification["testMode"] {
  if (!entry.metadata.enabled) {
    return "disabled";
  }
  return entry.metadata.name.toLowerCase().includes("simulated") ? "simulated" : "real";
}

function normalizeCredential(status: string): AdapterCertification["credentialStatus"] {
  if (status === "not_configured") return "missing";
  if (
    status === "configured" ||
    status === "missing" ||
    status === "invalid" ||
    status === "not_required"
  ) {
    return status;
  }
  return "unknown";
}
