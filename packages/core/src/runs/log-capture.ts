import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { makeId, SCHEMA_VERSION, type ArtifactContract } from "@fulcrum/shared";

export interface CaptureRunTranscriptInput {
  runId: string;
  logRoot: string;
  lines: string[];
}

export function captureRunTranscript(input: CaptureRunTranscriptInput): ArtifactContract {
  const directory = path.join(input.logRoot, input.runId);
  mkdirSync(directory, { recursive: true });
  const localRef = path.join(directory, "transcript.log");
  const body = input.lines.join("\n");
  writeFileSync(localRef, body);
  const now = new Date().toISOString();
  const hash = createHash("sha256").update(body).digest("hex");
  return {
    artifactId: makeId("art", `${input.runId}-transcript-${now}`),
    type: "transcript",
    localRef,
    summary: "Run transcript",
    runId: input.runId,
    hash: `sha256:${hash}`,
    sizeBytes: Buffer.byteLength(body),
    storageRef: `${input.runId}/transcript.log`,
    sourceRefs: [{ type: "file", uri: localRef }],
    linkedRefs: [{ type: "run", uri: input.runId }],
    retention: "keep",
    redactionStatus: "needs_review",
    provenance: { capturedBy: "core.log-capture", capturedAt: now },
    schemaVersion: SCHEMA_VERSION
  };
}
