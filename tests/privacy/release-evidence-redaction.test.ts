import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ReleaseEvidenceWriter } from "@fulcrum/core";

describe("release evidence redaction", () => {
  it("redacts secrets before writing the release evidence manifest", () => {
    const evidenceDir = mkdtempSync(path.join(tmpdir(), "fulcrum-redacted-release-"));
    const result = new ReleaseEvidenceWriter().write(evidenceDir, {
      schemaVersion: "1.0",
      releaseRunId: "release_redaction_test",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      environment: {
        GITHUB_TOKEN: "ghp_123456789012345678901234",
        PASSWORD: "super-secret-value"
      },
      commands: [
        {
          command: "release validate",
          output: "Authorization: Bearer abcdefghijklmnop"
        }
      ],
      artifacts: [],
      logs: [],
      complianceSummary: {},
      pass: false,
      failures: ["privacy"],
      nextActions: ["Remove secret material from evidence inputs."],
      redactionStatus: "not_redacted"
    });

    const manifest = readFileSync(result.manifestPath, "utf8");
    expect(result.redactionStatus).toBe("redacted");
    expect(manifest).not.toContain("ghp_123456789012345678901234");
    expect(manifest).not.toContain("super-secret-value");
    expect(manifest).not.toContain("abcdefghijklmnop");
    expect(manifest).toContain("[REDACTED");
  });
});
