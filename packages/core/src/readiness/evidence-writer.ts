import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { redactText } from "@fulcrum/policy";
import { ReleaseEvidencePackSchema, type ReleaseEvidencePack } from "@fulcrum/shared";

export interface EvidenceArtifactResult {
  artifactPath: string;
  redactionStatus: ReleaseEvidencePack["redactionStatus"];
  redactedPatterns: string[];
}

export interface EvidenceWriterResult {
  pack: ReleaseEvidencePack;
  manifestPath: string;
  redactionStatus: ReleaseEvidencePack["redactionStatus"];
  redactedPatterns: string[];
}

export class ReleaseEvidenceWriter {
  writeArtifact(rootDir: string, relativePath: string, value: unknown): EvidenceArtifactResult {
    const evidenceRoot = path.resolve(rootDir);
    const artifactPath = path.join(evidenceRoot, relativePath);
    mkdirSync(path.dirname(artifactPath), { recursive: true });

    const redacted = redactJson(value);
    writeFileSync(artifactPath, redacted.text);

    return {
      artifactPath: relativePath,
      redactionStatus: redacted.redactionStatus,
      redactedPatterns: redacted.redactedPatterns
    };
  }

  write(rootDir: string, pack: ReleaseEvidencePack): EvidenceWriterResult {
    const evidenceRoot = path.resolve(rootDir);
    mkdirSync(evidenceRoot, { recursive: true });

    const parsed = ReleaseEvidencePackSchema.parse(pack);
    const redacted = redactJson(parsed);
    const redactedPack = ReleaseEvidencePackSchema.parse({
      ...JSON.parse(redacted.text),
      redactionStatus: redacted.redactionStatus === "redacted" ? "redacted" : parsed.redactionStatus
    });
    const manifestPath = path.join(evidenceRoot, "release-evidence.json");
    writeFileSync(manifestPath, JSON.stringify(redactedPack, null, 2));

    return {
      pack: redactedPack,
      manifestPath,
      redactionStatus: redactedPack.redactionStatus,
      redactedPatterns: redacted.redactedPatterns
    };
  }
}

function redactJson(value: unknown): {
  text: string;
  redactionStatus: ReleaseEvidencePack["redactionStatus"];
  redactedPatterns: string[];
} {
  const redacted = redactText(JSON.stringify(value, null, 2));
  return {
    text: redacted.text,
    redactionStatus: redacted.redacted ? "redacted" : "not_redacted",
    redactedPatterns: [...new Set(redacted.matches)].sort()
  };
}
