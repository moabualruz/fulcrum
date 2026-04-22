import { describe, expect, it } from 'vitest'
import { redactProviderConfig, redactRagDetails, redactRagText } from '../setup/rag-redaction.js'

describe('RAG lifecycle redaction', () => {
  it('redacts secrets in log/report text', () => {
    const text = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456 and password=hunter2'
    const redacted = redactRagText(text)
    expect(redacted).not.toContain('abcdefghijklmnopqrstuvwxyz')
    expect(redacted).not.toContain('hunter2')
    expect(redacted).toContain('[REDACTED]')
  })

  it('redacts nested details for job events, explanations, and eval artifacts', () => {
    const redacted = redactRagDetails({
      explanation: 'token=abc123abc123abc123abc123',
      nested: { api_key: 'secret-value' },
      events: [{ message: 'password=local' }],
    })
    expect(JSON.stringify(redacted)).not.toContain('secret-value')
    expect(JSON.stringify(redacted)).not.toContain('password=local')
    expect(JSON.stringify(redacted)).toContain('[REDACTED]')
  })

  it('redacts provider configuration by sensitive key', () => {
    const redacted = redactProviderConfig({ provider: 'openai', api_key: 'sk-test' })
    expect(redacted).toEqual({ provider: 'openai', api_key: '[REDACTED]' })
  })
})

