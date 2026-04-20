import { describe, expect, it } from 'vitest'
import { scanForSecrets, SecretDetectedError } from '../secret-scan.js'

describe('scanForSecrets (AD-9e)', () => {
  it('accepts clean canonical text', () => {
    expect(() => scanForSecrets('/x.md', '# heading\n\nnothing to see here')).not.toThrow()
  })

  it('flags Anthropic-style sk- tokens', () => {
    expect(() =>
      scanForSecrets('/bad.md', 'key = "sk-abc123DEF456ghi789JKL012mno"'),
    ).toThrow(SecretDetectedError)
  })

  it('flags GitHub personal access tokens', () => {
    expect(() =>
      scanForSecrets('/bad.md', 'GITHUB_TOKEN=ghp_0123456789abcdefABCDEF0123456789abcd'),
    ).toThrow(/github-pat/)
  })

  it('flags GitHub fine-grained PATs', () => {
    expect(() =>
      scanForSecrets('/bad.md', 'github_pat_11AAAAAAA0qqqqqqqqqqqqq_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
    ).toThrow(/github-fine-grained/)
  })

  it('flags Slack xoxb tokens', () => {
    expect(() =>
      scanForSecrets('/bad.md', 'slackToken=xoxb-1234567890-abcdefghij'),
    ).toThrow(/slack-token/)
  })

  it('flags AWS access keys', () => {
    expect(() =>
      scanForSecrets('/bad.md', 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE'),
    ).toThrow(/aws-access-key/)
  })

  it('flags Bearer tokens', () => {
    expect(() =>
      scanForSecrets('/bad.md', 'curl -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJI"'),
    ).toThrow(/bearer-token/)
  })

  it('SecretDetectedError reports redacted sample + offset', () => {
    try {
      scanForSecrets('/bad.md', 'xoxb-1234567890-abcdefghij')
    } catch (error) {
      expect(error).toBeInstanceOf(SecretDetectedError)
      const typed = error as SecretDetectedError
      expect(typed.path).toBe('/bad.md')
      expect(typed.matches[0]?.pattern).toBe('slack-token')
      expect(typed.matches[0]?.sample).not.toContain('1234567890')
      return
    }
    throw new Error('expected SecretDetectedError to be thrown')
  })

  it('canonical skills directory passes the scan clean (integration)', async () => {
    const { parseCanonicalSource } = await import('../parse.js')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')
    const here = dirname(fileURLToPath(import.meta.url))
    const agentIntegrationRoot = join(here, '..', '..', '..', '..', 'agent-integration')
    expect(() => parseCanonicalSource({ agentIntegrationRoot })).not.toThrow()
  })
})
