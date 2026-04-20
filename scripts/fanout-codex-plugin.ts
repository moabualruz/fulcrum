#!/usr/bin/env tsx
// PR 6.4 + 6.5 — materialize the canonical-source fanout into the Codex
// plugin directory so `codex plugin marketplace add moabualruz/fulcrum` ships
// 33 skills + their openai.yaml sidecars out of the box. Safe to re-run;
// wipes and re-emits the whole skills tree.
//
//   pnpm tsx scripts/fanout-codex-plugin.ts
//
// The runtime installer (`installCodex` in agent-integration/install.ts) still
// writes to ~/.codex/skills/ for locally installed Codex deployments — the two
// paths are complementary: one for marketplace distribution, one for direct
// install.

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { parseCanonicalSource, emitCodex } from '../packages/agent-fanout/src/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const agentIntegrationRoot = path.join(repoRoot, 'agent-integration')
const pluginSkillsDir = path.join(agentIntegrationRoot, 'codex', 'plugin', 'skills')

if (fs.existsSync(pluginSkillsDir)) fs.rmSync(pluginSkillsDir, { recursive: true })
fs.mkdirSync(pluginSkillsDir, { recursive: true })

const source = parseCanonicalSource({ agentIntegrationRoot })
const result = emitCodex(source)
let written = 0
for (const art of result.artifacts) {
  if (!art.path.startsWith('skills/')) continue
  const rel = art.path.slice('skills/'.length)
  const dest = path.join(pluginSkillsDir, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, art.contents, 'utf8')
  written++
}
console.log(`fanout-codex-plugin: wrote ${written} files → ${path.relative(repoRoot, pluginSkillsDir)}`)
