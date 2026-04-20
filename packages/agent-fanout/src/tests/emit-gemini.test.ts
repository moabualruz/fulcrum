import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import matter from 'gray-matter'
import { parseCanonicalSource } from '../parse.js'
import { emitGemini } from '../emit/gemini.js'

const here = dirname(fileURLToPath(import.meta.url))
const agentIntegrationRoot = join(here, '..', '..', '..', '..', 'agent-integration')

describe('emitGemini', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitGemini(source)
  // Skill artifacts = skill-body MDs at skills/fulcrum-<name>/SKILL.md.
  // TOML slash commands (PR 7.7) also carry sourceSkillName since they
  // derive from canonical skills, but they live under commands/ and are
  // companion artifacts — filter them out for the 1:1 body invariant.
  const skillArtifacts = result.artifacts.filter(
    (a) => a.sourceSkillName && !a.path.startsWith('commands/'),
  )
  const commandArtifacts = result.artifacts.filter((a) => a.path.startsWith('commands/'))
  const ruleArtifacts = result.artifacts.filter((a) => a.sourceRuleName)

  it('targets gemini', () => {
    expect(result.target).toBe('gemini')
  })

  it('emits one skill artifact per canonical skill at skills/fulcrum-<name>/SKILL.md', () => {
    expect(skillArtifacts.length).toBe(33)
    expect(
      skillArtifacts.find((a) => a.sourceSkillName === 'heartbeat')?.path,
    ).toBe('skills/fulcrum-heartbeat/SKILL.md')
  })

  it('emits one rule artifact per canonical rule at rules/fulcrum-rule-<name>.md', () => {
    expect(ruleArtifacts.length).toBe(3)
    expect(
      ruleArtifacts.find((a) => a.sourceRuleName === 'lifecycle')?.path,
    ).toBe('rules/fulcrum-rule-lifecycle.md')
  })

  it('namespaces skill frontmatter.name to fulcrum-<canonical-name>', () => {
    for (const artifact of skillArtifacts) {
      const parsed = matter(artifact.contents)
      expect(parsed.data.name).toBe(`fulcrum-${artifact.sourceSkillName}`)
    }
  })

  it('preserves canonical skill body byte-for-byte (AD-6)', () => {
    for (const skill of source.skills) {
      const artifact = skillArtifacts.find((a) => a.sourceSkillName === skill.name)
      const parsed = matter(artifact!.contents)
      expect(parsed.content.trim()).toBe(skill.body)
    }
  })

  it('preserves rule as raw bytes (installer injects into GEMINI.md)', () => {
    for (const rule of source.rules) {
      const artifact = ruleArtifacts.find((a) => a.sourceRuleName === rule.name)
      expect(artifact?.contents).toBe(rule.raw)
    }
  })

  it('is deterministic', () => {
    expect(emitGemini(source).artifacts).toEqual(result.artifacts)
  })

  it('returns empty artifacts for empty source', () => {
    expect(emitGemini({ skills: [], rules: [] })).toEqual({ target: 'gemini', artifacts: [] })
  })

  // PR 7.7 — TOML slash commands derived from curated canonical skills.
  describe('PR 7.7 TOML slash commands', () => {
    it('emits one TOML command per entry in the curated SLASH_COMMAND_MAP', () => {
      expect(commandArtifacts.length).toBeGreaterThanOrEqual(6)
    })

    it('every TOML command carries description + prompt fields (Gemini custom-command schema)', () => {
      for (const art of commandArtifacts) {
        expect(art.contents, `${art.path} missing description`).toMatch(/^description\s*=/m)
        expect(art.contents, `${art.path} missing prompt`).toMatch(/^prompt\s*=\s*"""/m)
      }
    })

    it('commands land under commands/fulcrum/ subdir for /fulcrum:<name> namespacing', () => {
      for (const art of commandArtifacts) {
        expect(art.path).toMatch(/^commands\/fulcrum\/[\w-]+\.toml$/)
      }
    })

    it('commands embed canonical skill body text for prompt reproducibility', () => {
      for (const art of commandArtifacts) {
        const canonical = source.skills.find(s => s.name === art.sourceSkillName)
        expect(canonical, `${art.path} has no canonical source`).toBeDefined()
        // The canonical body must appear verbatim inside the TOML prompt block.
        const bodyFirstLine = canonical!.body.trim().split('\n')[0]!
        expect(art.contents).toContain(bodyFirstLine)
      }
    })
  })
})
