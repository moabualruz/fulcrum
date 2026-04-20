import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// SHA-256 companion for the opencode rider integrity chain (AD-9a).
// This module mirrors the READ contract in
// agent-integration/opencode/plugins/rider.ts `loadRider`:
//   - sort *.md filenames by localeCompare
//   - join bodies with '\n\n---\n\n'
//   - SHA-256 hex digest
// Any divergence here silently breaks plugin-side integrity verification, so
// the tests pin the exact input shape to keep them in lockstep.

export interface RiderShaResult {
  sha256: string
  ruleCount: number
  rider: string
}

export interface RidersumWriteResult {
  path: string
  sha256: string
  ruleCount: number
}

export function computeRiderSha(rulesDir: string): RiderShaResult {
  if (!existsSync(rulesDir)) {
    return { sha256: '', ruleCount: 0, rider: '' }
  }
  const entries = readdirSync(rulesDir)
    .filter((n) => n.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b))
  const bodies: string[] = []
  for (const name of entries) {
    const p = join(rulesDir, name)
    try {
      if (!statSync(p).isFile()) continue
    } catch { continue }
    bodies.push(readFileSync(p, 'utf8'))
  }
  if (bodies.length === 0) {
    return { sha256: '', ruleCount: 0, rider: '' }
  }
  const rider = bodies.join('\n\n---\n\n')
  const sha256 = createHash('sha256').update(rider).digest('hex')
  return { sha256, ruleCount: bodies.length, rider }
}

export function writeRidersum(rulesDir: string): RidersumWriteResult {
  const ridersumPath = join(dirname(rulesDir), '.ridersum')
  const { sha256, ruleCount } = computeRiderSha(rulesDir)
  if (sha256 === '') {
    return { path: ridersumPath, sha256: '', ruleCount: 0 }
  }
  writeFileSync(ridersumPath, sha256 + '\n', 'utf8')
  return { path: ridersumPath, sha256, ruleCount }
}
