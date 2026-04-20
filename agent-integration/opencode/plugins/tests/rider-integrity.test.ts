// PR 4 unit — rider load + integrity chain coverage.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createHash } from "crypto"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { loadRider } from "../rider"

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "fulcrum-opencode-rider-"))
})

afterEach(() => {
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

function writeRule(name: string, body: string): string {
  const rulesDir = join(tmp, "rules")
  mkdirSync(rulesDir, { recursive: true })
  writeFileSync(join(rulesDir, name), body, "utf8")
  return body
}

function writeRidersum(contents: string): void {
  mkdirSync(tmp, { recursive: true })
  writeFileSync(join(tmp, ".ridersum"), contents, "utf8")
}

function rulesRoot(): string {
  return join(tmp, "rules")
}

function computeSha(bodies: string[]): string {
  return createHash("sha256").update(bodies.join("\n\n---\n\n")).digest("hex")
}

describe("loadRider — canonical rider + AD-9a integrity chain", () => {
  it("returns empty rider when the rules directory is absent", () => {
    const r = loadRider(rulesRoot())
    expect(r.rider).toBe("")
    expect(r.ruleCount).toBe(0)
    expect(r.integrityOk).toBe(true)
    expect(r.integrityWarning).toBeNull()
  })

  it("loads and concatenates every .md rule sorted by filename", () => {
    writeRule("fulcrum-rule-fulcrum-first.md", "FIRST BODY")
    writeRule("fulcrum-rule-lifecycle.md", "LIFECYCLE BODY")
    writeRule("fulcrum-rule-role-boundaries.md", "ROLES BODY")
    const r = loadRider(rulesRoot())
    expect(r.ruleCount).toBe(3)
    expect(r.rider).toContain("FIRST BODY")
    expect(r.rider).toContain("LIFECYCLE BODY")
    expect(r.rider).toContain("ROLES BODY")
    // Sort order: first < lifecycle < role
    expect(r.rider.indexOf("FIRST BODY")).toBeLessThan(r.rider.indexOf("LIFECYCLE BODY"))
    expect(r.rider.indexOf("LIFECYCLE BODY")).toBeLessThan(r.rider.indexOf("ROLES BODY"))
  })

  it("computes a stable SHA-256 matching the concatenation contract", () => {
    const bodies = ["A CONTENT", "B CONTENT"]
    writeRule("fulcrum-rule-a.md", bodies[0]!)
    writeRule("fulcrum-rule-b.md", bodies[1]!)
    const r = loadRider(rulesRoot())
    expect(r.sha256).toBe(computeSha(bodies))
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it("passes integrity when .ridersum matches the computed SHA", () => {
    const body = "FULCRUM RULE BODY"
    writeRule("fulcrum-rule-x.md", body)
    writeRidersum(computeSha([body]))
    const r = loadRider(rulesRoot())
    expect(r.integrityOk).toBe(true)
    expect(r.integrityWarning).toBeNull()
  })

  it("fails OPEN when .ridersum mismatches — warns, continues, never blocks", () => {
    writeRule("fulcrum-rule-x.md", "REAL BODY")
    writeRidersum("0".repeat(64))
    const warnings: string[] = []
    const origWarn = console.warn
    console.warn = (msg?: unknown) => { if (typeof msg === "string") warnings.push(msg) }
    try {
      const r = loadRider(rulesRoot())
      expect(r.integrityOk).toBe(false)
      expect(r.integrityWarning).toContain("rider integrity mismatch")
      expect(warnings.length).toBeGreaterThanOrEqual(1)
      // Critical: fail-open per AD-3 — the rider string is still populated.
      expect(r.rider).toContain("REAL BODY")
    } finally {
      console.warn = origWarn
    }
  })

  it("tolerates a read failure mid-load and returns a safe empty result", () => {
    const rulesDir = join(tmp, "rules")
    mkdirSync(rulesDir, { recursive: true })
    // A directory with a .md suffix inside rules/ is not readable as a file;
    // loadRider should catch and return with an integrity warning.
    mkdirSync(join(rulesDir, "fulcrum-rule-bad.md"), { recursive: true })
    const r = loadRider(rulesRoot())
    // Either the bad entry was skipped (0 rules, clean) or it threw and we
    // got the caught-error shape. Either way, never throws out of loadRider.
    expect([0, 1]).toContain(r.ruleCount)
  })
})
