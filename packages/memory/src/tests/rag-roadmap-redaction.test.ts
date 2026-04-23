import { describe, expect, it } from 'vitest'
import { pathFingerprintForRoadmap, redactRoadmapArtifact } from '../setup/rag-redaction.js'

describe('RAG roadmap redaction helpers', () => {
  const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN'
  const absPath = '/home/example/private/project/.env'

  it('uses stable fingerprints instead of raw paths in agent-facing repair plans', () => {
    const redacted = redactRoadmapArtifact({
      repair_plan_id: 'ragrepairplan_1',
      profile_path: absPath,
      api_key: secret,
    })

    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain(absPath)
    expect(serialized).not.toContain(secret)
    expect(serialized).toContain('sha256:')
  })

  it('redacts trace, eval, and context search artifacts recursively', () => {
    const redacted = redactRoadmapArtifact({
      trace: { file_path: absPath, token: secret },
      eval: { artifact_path: absPath },
      result: { source_ref: { file_path: absPath } },
    })

    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain(absPath)
    expect(serialized).not.toContain(secret)
    expect(serialized).toContain('[REDACTED_PATH:')
  })

  it('path fingerprints do not expose path segments', () => {
    const fingerprint = pathFingerprintForRoadmap(absPath)
    expect(fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(fingerprint).not.toContain('private')
  })
})
