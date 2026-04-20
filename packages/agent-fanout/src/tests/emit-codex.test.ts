import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import matter from 'gray-matter'
import { parseCanonicalSource } from '../parse.js'
import { emitCodex } from '../emit/codex.js'

const here = dirname(fileURLToPath(import.meta.url))
const agentIntegrationRoot = join(here, '..', '..', '..', '..', 'agent-integration')

describe('emitCodex', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitCodex(source)
  // Skill artifacts are the SKILL.md files; sidecars share sourceSkillName
  // but live under /agents/openai.yaml — filter them out for identity tests.
  const skillArtifacts = result.artifacts.filter(
    (a) => a.sourceSkillName && a.path.endsWith('/SKILL.md'),
  )
  const ruleArtifacts = result.artifacts.filter((a) => a.sourceRuleName)

  it('targets codex', () => {
    expect(result.target).toBe('codex')
  })

  it('emits one skill artifact per canonical skill at skills/fulcrum-<name>/SKILL.md', () => {
    expect(skillArtifacts.length).toBe(33)
    const heartbeat = skillArtifacts.find((a) => a.sourceSkillName === 'heartbeat')
    expect(heartbeat?.path).toBe('skills/fulcrum-heartbeat/SKILL.md')
  })

  it('emits one rule artifact per canonical rule at rules/fulcrum-rule-<name>.md', () => {
    expect(ruleArtifacts.length).toBe(3)
    const first = ruleArtifacts.find((a) => a.sourceRuleName === 'fulcrum-first')
    expect(first?.path).toBe('rules/fulcrum-rule-fulcrum-first.md')
  })

  it('rewrites frontmatter.name to fulcrum-<canonical-name> (namespacing)', () => {
    for (const artifact of skillArtifacts) {
      const parsed = matter(artifact.contents)
      expect(parsed.data.name).toBe(`fulcrum-${artifact.sourceSkillName}`)
    }
  })

  it('preserves canonical skill body byte-for-byte (per-skill identity, AD-6)', () => {
    for (const skill of source.skills) {
      const artifact = skillArtifacts.find((a) => a.sourceSkillName === skill.name)
      const parsed = matter(artifact!.contents)
      expect(parsed.content.trim()).toBe(skill.body)
    }
  })

  it('preserves canonical rule as raw bytes (installer injects into AGENTS.md)', () => {
    for (const rule of source.rules) {
      const artifact = ruleArtifacts.find((a) => a.sourceRuleName === rule.name)
      expect(artifact?.contents).toBe(rule.raw)
    }
  })

  it('narrows a non-string description to empty string', () => {
    const result = emitCodex({
      skills: [
        {
          name: 'weird', path: '/weird/SKILL.md',
          frontmatter: { description: 42 }, body: '# Weird',
          raw: '---\ndescription: 42\n---\n\n# Weird\n',
        },
      ],
      rules: [],
    })
    const parsed = matter(result.artifacts[0]!.contents)
    expect(parsed.data.description).toBe('')
  })

  it('is deterministic', () => {
    expect(emitCodex(source).artifacts).toEqual(result.artifacts)
  })

  it('returns empty artifacts for empty source', () => {
    expect(emitCodex({ skills: [], rules: [] })).toEqual({ target: 'codex', artifacts: [] })
  })

  // PR 6.5 — openai.yaml sidecars per skill at skills/fulcrum-<name>/agents/openai.yaml.
  describe('openai.yaml sidecars', () => {
    const sidecarArtifacts = result.artifacts.filter((a) => a.path.endsWith('/agents/openai.yaml'))

    it('emits one openai.yaml sidecar per skill', () => {
      expect(sidecarArtifacts.length).toBe(33)
    })

    it('sidecar path mirrors skill path under agents/openai.yaml', () => {
      const heartbeat = sidecarArtifacts.find((a) => a.sourceSkillName === 'heartbeat')
      expect(heartbeat?.path).toBe('skills/fulcrum-heartbeat/agents/openai.yaml')
    })

    it('sidecar interface.display_name is title-cased from skill name', () => {
      const artifact = sidecarArtifacts.find((a) => a.sourceSkillName === 'start-every-task')
      expect(artifact?.contents).toContain('display_name: Start Every Task')
    })

    it('sidecar interface.short_description carries the SKILL.md description', () => {
      const artifact = sidecarArtifacts.find((a) => a.sourceSkillName === 'recall-before-writing')
      expect(artifact?.contents).toMatch(/short_description:/)
      // Exact description text is frontmatter-derived; just verify the field is populated
      const match = artifact?.contents.match(/short_description: (.+)/)
      expect(match?.[1]?.trim().length).toBeGreaterThan(0)
    })

    it('sidecar interface.brand_color is the Fulcrum brand constant', () => {
      const artifact = sidecarArtifacts[0]!
      expect(artifact.contents).toContain("brand_color: '#4F46E5'")
    })

    it('write-class skills set policy.allow_implicit_invocation: false', () => {
      // start-every-task triggers start_agent_run — high-stakes write, needs user intent
      const a = sidecarArtifacts.find((x) => x.sourceSkillName === 'start-every-task')
      expect(a?.contents).toContain('allow_implicit_invocation: false')
    })

    it('read-only recall skills set policy.allow_implicit_invocation: true', () => {
      const a = sidecarArtifacts.find((x) => x.sourceSkillName === 'recall-before-writing')
      expect(a?.contents).toContain('allow_implicit_invocation: true')
    })

    it('dependencies.tools[] lists mcp__fulcrum__* tools referenced in the skill body', () => {
      // write-memory-on-completion references write_memory MCP tool
      const a = sidecarArtifacts.find((x) => x.sourceSkillName === 'write-memory-on-completion')
      expect(a?.contents).toMatch(/tools:/)
      expect(a?.contents).toMatch(/mcp__fulcrum__write_memory/)
    })

    it('is deterministic', () => {
      expect(emitCodex(source).artifacts.filter(a => a.path.endsWith('/agents/openai.yaml'))).toEqual(sidecarArtifacts)
    })
  })
})
