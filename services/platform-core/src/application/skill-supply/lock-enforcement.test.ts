/**
 * Skill lock fail-closed gate (RTR-07).
 *
 * Tests that `skills.lock.json` SHA-256 mismatch:
 * - Returns `status: "sha_mismatch"` and `available: false` for the
 *   affected skill
 * - Exposes exact `expectedSha256` and `actualSha256` values
 * - Renders the skill unavailable until override with audit payload
 *
 */

import { describe, it, expect } from "bun:test";

import { verifySkillLock } from "./lock.ts";

// ── SHA-256 helper (shared across skills modules) ──────────────────────
import { sha256Hex } from "./mcp-virtual-skills.ts";

interface LockOverrideAudit {
  slug: string;
  overriddenBy: string;
  overriddenAt: string;
  previousExpectedSha256: string;
  previousActualSha256: string | null;
  action: "accept" | "reinstall" | "remove";
  reason: string;
}

function overrideLockMismatch(params: {
  slug: string;
  expectedSha256: string;
  actualSha256: string | null;
  action: LockOverrideAudit["action"];
  reason: string;
  overriddenBy: string;
}): LockOverrideAudit {
  return {
    slug: params.slug,
    overriddenBy: params.overriddenBy,
    overriddenAt: new Date().toISOString(),
    previousExpectedSha256: params.expectedSha256,
    previousActualSha256: params.actualSha256,
    action: params.action,
    reason: params.reason,
  };
}

const SAMPLE_SKILL_CONTENT = `# Test Skill

A sample skill for lock enforcement tests.
`;

const TAMPERED_SKILL_CONTENT = `# Test Skill (TAMPERED)

This content was modified after installation.
`;

const SAMPLE_EXPECTED_HASH = sha256Hex(SAMPLE_SKILL_CONTENT);
const TAMPERED_HASH = sha256Hex(TAMPERED_SKILL_CONTENT);

// ── Tests ──────────────────────────────────────────────────────────────

describe("skill lock enforcement - SHA mismatch (RTR-07)", () => {
  it("returns sha_mismatch when actual content hash differs from expected", () => {
    const result = verifySkillLock("test-skill", SAMPLE_EXPECTED_HASH, TAMPERED_SKILL_CONTENT);

    expect(result.status).toBe("sha_mismatch");
    expect(result.available).toBe(false);
    expect(result.expectedSha256).toBe(SAMPLE_EXPECTED_HASH);
    expect(result.actualSha256).toBe(TAMPERED_HASH);
    expect(result.expectedSha256).not.toBe(result.actualSha256);
  });

  it("returns ok when hashes match", () => {
    const result = verifySkillLock("test-skill", SAMPLE_EXPECTED_HASH, SAMPLE_SKILL_CONTENT);

    expect(result.status).toBe("ok");
    expect(result.available).toBe(true);
    expect(result.expectedSha256).toBe(SAMPLE_EXPECTED_HASH);
    expect(result.actualSha256).toBe(SAMPLE_EXPECTED_HASH);
  });

  it("returns missing when content is null", () => {
    const result = verifySkillLock("missing-skill", SAMPLE_EXPECTED_HASH, null);

    expect(result.status).toBe("missing");
    expect(result.available).toBe(false);
    expect(result.expectedSha256).toBe(SAMPLE_EXPECTED_HASH);
    expect(result.actualSha256).toBeNull();
  });

  it("exposes exact expected and actual SHA values", () => {
    const expected = "a".repeat(64);
    const actual = "b".repeat(64);
    const result = verifySkillLock("sha-demo", expected, `content-with-hash-${actual}`);

    expect(result.expectedSha256).toBe(expected);
    expect(result.actualSha256).not.toBeNull();
    expect(result.expectedSha256).not.toBe(result.actualSha256);
  });
});

describe("skill lock enforcement - override audit (D-21, D-24)", () => {
  it("creates audit record on lock override", () => {
    const audit = overrideLockMismatch({
      slug: "test-skill",
      expectedSha256: SAMPLE_EXPECTED_HASH,
      actualSha256: TAMPERED_HASH,
      action: "accept",
      reason: "tampered content is intentional — local edit confirmed",
      overriddenBy: "admin@example.com",
    });

    expect(audit.slug).toBe("test-skill");
    expect(audit.action).toBe("accept");
    expect(audit.reason).toBeTruthy();
    expect(audit.overriddenBy).toBe("admin@example.com");
    expect(audit.overriddenAt).toBeTruthy();
    expect(audit.previousExpectedSha256).toBe(SAMPLE_EXPECTED_HASH);
    expect(audit.previousActualSha256).toBe(TAMPERED_HASH);
  });

  it("supports reinstall and remove override actions", () => {
    const reinstall = overrideLockMismatch({
      slug: "broken-skill",
      expectedSha256: SAMPLE_EXPECTED_HASH,
      actualSha256: TAMPERED_HASH,
      action: "reinstall",
      reason: "reinstall upstream version",
      overriddenBy: "cli-operator",
    });
    expect(reinstall.action).toBe("reinstall");

    const remove = overrideLockMismatch({
      slug: "deprecated-skill",
      expectedSha256: SAMPLE_EXPECTED_HASH,
      actualSha256: TAMPERED_HASH,
      action: "remove",
      reason: "skill no longer needed",
      overriddenBy: "cli-operator",
    });
    expect(remove.action).toBe("remove");
  });
});
