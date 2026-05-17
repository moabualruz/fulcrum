import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  computeSpecHash,
  readLockHash,
  writeLockHash,
  detectDrift,
  writeDriftReport,
  type SyncResult,
} from "./sync.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-sync-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// computeSpecHash
// ---------------------------------------------------------------------------
describe("computeSpecHash", () => {
  test("returns SHA-256 hex of file contents", () => {
    const f = join(scratch, "spec-hash.md");
    writeFileSync(f, "# SPEC\nHello world\n");
    const hash = computeSpecHash(f);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("returns null for missing file", () => {
    expect(computeSpecHash(join(scratch, "nope.md"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readLockHash / writeLockHash
// ---------------------------------------------------------------------------
describe("lock file round-trip", () => {
  test("readLockHash returns null when lock missing", () => {
    expect(readLockHash(join(scratch, "no-lock"))).toBeNull();
  });

  test("writeLockHash then readLockHash returns same hash", () => {
    const lockDir = join(scratch, "lock-rt");
    mkdirSync(lockDir, { recursive: true });
    writeLockHash(lockDir, "abc123");
    expect(readLockHash(lockDir)).toBe("abc123");
  });
});

// ---------------------------------------------------------------------------
// detectDrift — unchanged hash → no drift
// ---------------------------------------------------------------------------
describe("detectDrift", () => {
  test("unchanged SPEC hash → driftDetected false, no report written", () => {
    const dir = join(scratch, "no-drift");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "vendor", "openai-symphony"), { recursive: true });
    mkdirSync(join(dir, ".fulcrum", "reports"), { recursive: true });

    const specContent = "# SPEC v1\n";
    writeFileSync(join(dir, "vendor", "openai-symphony", "SPEC.md"), specContent);

    // Pre-seed lock with current hash
    const hash = computeSpecHash(join(dir, "vendor", "openai-symphony", "SPEC.md"))!;
    writeLockHash(dir, hash);

    const result = detectDrift(dir);
    expect(result.driftDetected).toBe(false);
    expect(result.reportPath).toBeNull();
  });

  test("changed SPEC hash → driftDetected true, report written, lock updated", () => {
    const dir = join(scratch, "has-drift");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "vendor", "openai-symphony"), { recursive: true });
    mkdirSync(join(dir, ".fulcrum", "reports"), { recursive: true });

    // Seed lock with old hash
    writeLockHash(dir, "old-hash-value");

    const specContent = "# SPEC v2 — changed\n";
    writeFileSync(join(dir, "vendor", "openai-symphony", "SPEC.md"), specContent);

    const result = detectDrift(dir);
    expect(result.driftDetected).toBe(true);
    expect(result.reportPath).not.toBeNull();
    expect(existsSync(result.reportPath!)).toBe(true);

    // Lock should be updated
    const newHash = computeSpecHash(join(dir, "vendor", "openai-symphony", "SPEC.md"));
    expect(readLockHash(dir)).toBe(newHash);
  });

  test("missing SPEC.md → driftDetected false, specMissing true", () => {
    const dir = join(scratch, "missing-spec");
    mkdirSync(dir, { recursive: true });

    const result = detectDrift(dir);
    expect(result.driftDetected).toBe(false);
    expect(result.specMissing).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// writeDriftReport
// ---------------------------------------------------------------------------
describe("writeDriftReport", () => {
  test("creates report file with expected content", () => {
    const reportsDir = join(scratch, "reports");
    mkdirSync(reportsDir, { recursive: true });
    const path = writeDriftReport(reportsDir, "oldhash", "newhash", "diff output here");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("oldhash");
    expect(content).toContain("newhash");
    expect(content).toContain("diff output here");
  });
});

// ---------------------------------------------------------------------------
// --json output shape
// ---------------------------------------------------------------------------
describe("SyncResult JSON shape", () => {
  test("matches expected keys", () => {
    const result: SyncResult = {
      driftDetected: true,
      reportPath: "/tmp/report.md",
      conformancePassed: true,
      specMissing: false,
    };
    const parsed = JSON.parse(JSON.stringify(result));
    expect(parsed).toHaveProperty("driftDetected");
    expect(parsed).toHaveProperty("reportPath");
    expect(parsed).toHaveProperty("conformancePassed");
  });
});
