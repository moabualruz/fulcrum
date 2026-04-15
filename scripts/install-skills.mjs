#!/usr/bin/env node
/**
 * Install Fulcrum skills where Claude Code can load them.
 *
 * Claude Code reads skills from:
 *   - ~/.claude/skills/<name>/SKILL.md  (user-global)
 *   - <repo>/.claude/skills/<name>/SKILL.md  (project-scoped)
 *
 * This script symlinks agent-integration/skills/ into both locations.
 */
import { mkdirSync, symlinkSync, existsSync, rmSync, realpathSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(__filename), '..')
const src = resolve(repoRoot, 'agent-integration', 'skills')

const targets = [
  join(homedir(), '.claude', 'skills', 'fulcrum'),
  join(repoRoot, '.claude', 'skills', 'fulcrum'),
]

for (const dest of targets) {
  mkdirSync(dirname(dest), { recursive: true })
  if (existsSync(dest)) {
    // If it's already a symlink pointing to the right place, skip
    try {
      if (realpathSync(dest) === realpathSync(src)) {
        console.log(`✓  Already linked: ${dest}`)
        continue
      }
    } catch { /* dangling symlink or not a symlink — remove and re-link */ }
    rmSync(dest, { recursive: true, force: true })
  }
  symlinkSync(src, dest, 'dir')
  console.log(`→  Linked: ${src} → ${dest}`)
}

console.log('\nFulcrum skills installed. Restart Claude Code to load them.')
