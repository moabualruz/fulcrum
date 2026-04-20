// Fan 24 canonical role MDs from agent-integration/claude/agents/ to
// agent-integration/skills/roles/<slug>.md (flat layout), readable via
// the cockpit's `/fulcrum:role <slug>` command.
//
// The cockpit's `skills` dir is a symlink to `agent-integration/skills/`, so
// writing `skills/roles/*.md` makes the roles visible at
// `agent-integration/pi/cockpit/skills/roles/` — where pi-compliance.test.ts
// asserts them. parseCanonicalSource iterates top-level entries of
// `agent-integration/skills/` and skips any directory without a top-level
// SKILL.md, so a `roles/` subdir is invisible to the canonical-skill parser.
//
// Translation: keep `name` + `description` in frontmatter, drop Claude-only
// `model:` + `tools:` (PI has a different tool surface), and keep the body
// verbatim. The body is appended to systemPrompt by cockpit/index.ts on
// `before_agent_start` when `activeRole === <slug>`.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { replaceMarkerBlock } from '../packages/agent-fanout/src/marker-block.js'

const _dir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(_dir, '..')
const claudeAgentsDir = path.join(repoRoot, 'agent-integration', 'claude', 'agents')
const rolesOutDir = path.join(repoRoot, 'agent-integration', 'skills', 'roles')
const rulesDir = path.join(repoRoot, 'agent-integration', 'rules')
const repoAgentsMd = path.join(repoRoot, 'AGENTS.md')

if (!fs.existsSync(claudeAgentsDir)) {
  console.error(`fanout-pi-cockpit: missing source ${claudeAgentsDir}`)
  process.exit(1)
}

fs.mkdirSync(rolesOutDir, { recursive: true })

// Wipe stale role files so removals in the canonical source propagate.
for (const existing of fs.readdirSync(rolesOutDir)) {
  if (existing.endsWith('.md')) fs.rmSync(path.join(rolesOutDir, existing))
}

let count = 0
for (const file of fs.readdirSync(claudeAgentsDir).filter(f => f.endsWith('.md')).sort()) {
  const slug = file.replace(/\.md$/, '')
  const raw = fs.readFileSync(path.join(claudeAgentsDir, file), 'utf8')
  const translated = translateRoleForPi(raw, slug)
  fs.writeFileSync(path.join(rolesOutDir, `${slug}.md`), translated, 'utf8')
  count++
}

// Repo-root AGENTS.md managed block. PI walks `AGENTS.md` up from cwd per
// docs/skills.md + docs/sdk.md — `PI.md` is not auto-loaded. The 3 canonical
// rules ship inside a single BEGIN/END FULCRUM managed-block v1 region so
// the file can be re-emitted idempotently without stomping user prose.
const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md')).sort()
const rulesContent = ruleFiles
  .map(f => fs.readFileSync(path.join(rulesDir, f), 'utf8').trim())
  .join('\n\n---\n\n')
const managed = `## Fulcrum canonical rules (auto-generated)\n\n${rulesContent}`
const existingAgentsMd = fs.existsSync(repoAgentsMd) ? fs.readFileSync(repoAgentsMd, 'utf8') : ''
const { contents: newAgentsMd } = replaceMarkerBlock({
  existing: existingAgentsMd,
  managed,
  placement: 'end',
})
fs.writeFileSync(repoAgentsMd, newAgentsMd, 'utf8')

console.log(`fanout-pi-cockpit: wrote ${count} role MD(s) → ${path.relative(repoRoot, rolesOutDir)}`)
console.log(`fanout-pi-cockpit: wrote AGENTS.md managed-block (${ruleFiles.length} rule(s))`)

export function translateRoleForPi(raw: string, slug: string): string {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const body = fmMatch ? (fmMatch[2] ?? '').trim() : raw.trim()
  const fm = fmMatch ? (fmMatch[1] ?? '') : ''

  const nameMatch = fm.match(/^name:\s*(.+)$/m)
  const displayName = nameMatch ? nameMatch[1]!.trim() : slug

  const descMatch = fm.match(/^description:\s*(>-?\s*\n\s+|)?(.+)$/m)
  let description = descMatch ? descMatch[2]!.trim() : ''
  if (descMatch?.[1]?.startsWith('>')) {
    const lines = fm.split('\n')
    const startIdx = lines.findIndex(l => /^description:\s*>/.test(l))
    if (startIdx >= 0) {
      const folded: string[] = []
      for (let i = startIdx + 1; i < lines.length; i++) {
        const line = lines[i] ?? ''
        if (/^\S/.test(line)) break
        folded.push(line.trim())
      }
      description = folded.join(' ').trim()
    }
  }

  const descYaml = description.replace(/"/g, '\\"')
  return `---\nname: ${slug}\ndisplay_name: "${displayName}"\ndescription: "${descYaml}"\nkind: role\n---\n\n${body}\n`
}
