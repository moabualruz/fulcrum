// PR 4 — canonical opencode system rider + AD-9a integrity chain.
// Isolated from the @opencode-ai/plugin import so tests can exercise it
// without pulling the plugin runtime surface.

import { createHash } from "crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"

export interface RiderLoadResult {
  rider: string
  ruleCount: number
  sha256: string
  integrityOk: boolean
  integrityWarning: string | null
}

export function findRulesRoot(): string | null {
  // Plugin may be loaded from node_modules (npm publish shape) or directly
  // from agent-integration/opencode/ (dogfood). Try both locations.
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const candidates = [
      resolve(here, "..", ".opencode", "rules"),
      resolve(here, "..", "..", ".opencode", "rules"),
      resolve(here, "..", "..", "..", "rules"),
      resolve(process.cwd(), ".opencode", "rules"),
      resolve(process.cwd(), "agent-integration", "rules"),
    ]
    for (const c of candidates) {
      if (existsSync(c)) return c
    }
  } catch { /* ignore */ }
  return null
}

/**
 * Load the canonical rider by concatenating every .md file under the rules
 * directory, sorted alphabetically. Compute SHA-256. If a sibling `.ridersum`
 * exists, verify — on mismatch, fail open: log a warning via console.warn and
 * return with `integrityOk=false` but still populate the rider (AD-3 fail-open).
 */
export function loadRider(rulesRootOverride?: string): RiderLoadResult {
  const rulesRoot = rulesRootOverride ?? findRulesRoot()
  const empty: RiderLoadResult = {
    rider: "",
    ruleCount: 0,
    sha256: "",
    integrityOk: true,
    integrityWarning: null,
  }
  if (!rulesRoot || !existsSync(rulesRoot)) return empty

  try {
    const files = readdirSync(rulesRoot)
      .filter((n) => n.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b))
    if (files.length === 0) return empty

    const bodies: string[] = []
    for (const name of files) {
      const p = join(rulesRoot, name)
      try {
        if (!statSync(p).isFile()) continue
      } catch { continue }
      bodies.push(readFileSync(p, "utf8"))
    }
    if (bodies.length === 0) return empty

    const rider = bodies.join("\n\n---\n\n")
    const sha = createHash("sha256").update(rider).digest("hex")

    const riderSumPath = join(dirname(rulesRoot), ".ridersum")
    let integrityOk = true
    let integrityWarning: string | null = null
    if (existsSync(riderSumPath)) {
      const expected = readFileSync(riderSumPath, "utf8").trim()
      if (expected !== sha) {
        integrityOk = false
        integrityWarning =
          `[fulcrum/opencode] rider integrity mismatch — ` +
          `expected ${expected.slice(0, 12)}..., computed ${sha.slice(0, 12)}.... ` +
          `Continuing without integrity guarantee; run \`fulcrum install verify --agent opencode\` to diagnose.`
        console.warn(integrityWarning)
      }
    }

    return { rider, ruleCount: bodies.length, sha256: sha, integrityOk, integrityWarning }
  } catch (err) {
    return {
      rider: "",
      ruleCount: 0,
      sha256: "",
      integrityOk: false,
      integrityWarning: `[fulcrum/opencode] rider load failed: ${(err as Error).message}`,
    }
  }
}
