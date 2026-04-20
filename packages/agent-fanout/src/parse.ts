import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import type { CanonicalRule, CanonicalSkill, CanonicalSource } from './types.js'
import { scanForSecrets } from './secret-scan.js'

export interface ParseOptions {
  agentIntegrationRoot: string
}

export function parseCanonicalSource(options: ParseOptions): CanonicalSource {
  const { agentIntegrationRoot } = options
  return {
    skills: parseSkills(join(agentIntegrationRoot, 'skills')),
    rules: parseRules(join(agentIntegrationRoot, 'rules')),
  }
}

function parseSkills(skillsRoot: string): CanonicalSkill[] {
  if (!existsSync(skillsRoot)) return []
  const entries = readdirSync(skillsRoot)
  const skills: CanonicalSkill[] = []
  for (const entry of entries) {
    const entryPath = join(skillsRoot, entry)
    if (!statSync(entryPath).isDirectory()) continue
    const skillFile = join(entryPath, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    const raw = readFileSync(skillFile, 'utf8')
    scanForSecrets(skillFile, raw)
    const parsed = matter(raw)
    skills.push({
      name: entry,
      path: skillFile,
      frontmatter: parsed.data,
      body: parsed.content.trim(),
      raw,
    })
  }
  skills.sort((a, b) => a.name.localeCompare(b.name))
  return skills
}

function parseRules(rulesRoot: string): CanonicalRule[] {
  if (!existsSync(rulesRoot)) return []
  const entries = readdirSync(rulesRoot)
  const rules: CanonicalRule[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue
    const rulePath = join(rulesRoot, entry)
    if (!statSync(rulePath).isFile()) continue
    const raw = readFileSync(rulePath, 'utf8')
    scanForSecrets(rulePath, raw)
    const parsed = matter(raw)
    rules.push({
      name: entry.replace(/\.md$/, ''),
      path: rulePath,
      frontmatter: parsed.data,
      body: parsed.content.trim(),
      raw,
    })
  }
  rules.sort((a, b) => a.name.localeCompare(b.name))
  return rules
}
