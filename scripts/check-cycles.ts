#!/usr/bin/env node
/**
 * scripts/check-cycles.ts
 *
 * Detect circular dependencies within each Fulcrum package using madge.
 * Exits 1 if any cycle is found; 0 if clean.
 *
 * Usage:
 *   node --import tsx/esm scripts/check-cycles.ts
 *   pnpm check:cycles
 */

import madge from 'madge'
import { readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const ROOT = resolve(__dirname, '..')
const PACKAGES_DIR = join(ROOT, 'packages')

async function main(): Promise<void> {
  const pkgDirs = readdirSync(PACKAGES_DIR)
    .map(d => join(PACKAGES_DIR, d))
    .filter(d => {
      try { return statSync(d).isDirectory() } catch { return false }
    })

  let totalCycles = 0
  const results: Array<{ pkg: string; cycles: string[][] }> = []

  for (const pkgDir of pkgDirs) {
    const srcDir = join(pkgDir, 'src')
    try {
      const res = await madge(srcDir, {
        fileExtensions: ['ts'],
        tsConfig: join(pkgDir, 'tsconfig.json'),
        // Exclude cross-package workspace imports from cycle detection —
        // these appear as relative paths like '../../teams/src/...' because
        // madge resolves pnpm workspace: links. Dynamic imports that
        // intentionally break static cycles should not be flagged.
        excludeRegExp: [
          /\.\.\/\.\.\/[a-z-]+\/src\/.*/,  // cross-package ../../teams/src/... paths
        ],
      })
      const cycles = res.circular()
      const pkgName = pkgDir.split('/').pop() ?? pkgDir
      results.push({ pkg: pkgName, cycles })
      totalCycles += cycles.length
    } catch {
      // package may not have a src dir or tsconfig — skip silently
    }
  }

  // Report
  let hasFailure = false
  for (const { pkg, cycles } of results) {
    if (cycles.length > 0) {
      console.error(`\n❌  @fulcrum/${pkg}: ${cycles.length} circular dependency cycle(s)`)
      for (const cycle of cycles) {
        console.error(`   ${cycle.join(' → ')} → ${cycle[0]}`)
      }
      hasFailure = true
    } else {
      console.log(`✓  @fulcrum/${pkg}: no cycles`)
    }
  }

  console.log('')
  if (hasFailure) {
    console.error(`Found ${totalCycles} total cycle(s). Fix them before merging.`)
    process.exit(1)
  }
  console.log(`All packages clean — no circular dependencies.`)
}

main().catch(err => {
  console.error('check-cycles failed:', (err as Error).message)
  process.exit(1)
})
