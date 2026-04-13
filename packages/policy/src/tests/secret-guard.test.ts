// packages/policy/src/tests/secret-guard.test.ts
import { describe, it, expect } from 'vitest'
import { checkSecrets, redactSecrets } from '../secret-guard.js'

// No DB required — pure synchronous functions

describe('checkSecrets — API key pattern', () => {
  it('detects sk_ prefixed API key', () => {
    const result = checkSecrets('Use token sk_abcdefghijklmnopqrstuvwx for auth')
    expect(result.has_secrets).toBe(true)
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].pattern_name).toBe('api_key')
  })

  it('detects api_key format with underscore', () => {
    const result = checkSecrets('Set API_KEY=api_aBcDeFgHiJkLmNoPqRsTuVwXyZ for the service')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('api_key')
  })

  it('detects token_ prefix', () => {
    const result = checkSecrets('token_XYZabc123DEFghi456JKLmno789PQR')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('api_key')
  })

  it('does not flag short strings after key prefix', () => {
    // pattern requires 20+ chars after the separator
    const result = checkSecrets('sk_tooshort')
    expect(result.has_secrets).toBe(false)
  })
})

describe('checkSecrets — private key pattern', () => {
  it('detects RSA private key header', () => {
    const result = checkSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK...')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('private_key')
  })

  it('detects EC private key header', () => {
    const result = checkSecrets('-----BEGIN EC PRIVATE KEY-----')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('private_key')
  })

  it('detects OPENSSH private key header', () => {
    const result = checkSecrets('-----BEGIN OPENSSH PRIVATE KEY-----')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('private_key')
  })

  it('detects generic PRIVATE KEY header (no type prefix)', () => {
    const result = checkSecrets('-----BEGIN PRIVATE KEY-----')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('private_key')
  })
})

describe('checkSecrets — OAuth token pattern', () => {
  it('detects GitHub PAT ghp_ token', () => {
    const text = 'Authorization: Bearer ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij'
    const result = checkSecrets(text)
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('oauth_token')
  })

  it('detects ghu_ token', () => {
    const result = checkSecrets('ghu_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('oauth_token')
  })

  it('detects ghs_ token', () => {
    const result = checkSecrets('ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('oauth_token')
  })

  it('does not detect non-github tokens', () => {
    const result = checkSecrets('xyz_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij')
    // Only ghp/ghu/ghs/gho are in the pattern
    expect(result.matches.filter(m => m.pattern_name === 'oauth_token')).toHaveLength(0)
  })
})

describe('checkSecrets — password KV pattern', () => {
  it('detects password= assignment', () => {
    const result = checkSecrets('password=supersecret123')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('password_kv')
  })

  it('detects passwd: assignment', () => {
    const result = checkSecrets('passwd: hunter2')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('password_kv')
  })

  it('detects secret= assignment', () => {
    const result = checkSecrets('secret=mysecretvalue')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('password_kv')
  })

  it('is case-insensitive', () => {
    const result = checkSecrets('PASSWORD=UPPERCASE123')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('password_kv')
  })
})

describe('checkSecrets — credential URL pattern', () => {
  it('detects credentials in URL', () => {
    const result = checkSecrets('Connect to postgres://admin:password123@localhost:5432/mydb')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('credential_url')
  })

  it('detects credentials in http URL', () => {
    const result = checkSecrets('curl http://user:pass@example.com/api')
    expect(result.has_secrets).toBe(true)
    expect(result.matches[0].pattern_name).toBe('credential_url')
  })

  it('does not flag URLs without credentials', () => {
    const result = checkSecrets('See https://example.com/docs for details')
    // No user:pass@ pattern
    expect(result.matches.filter(m => m.pattern_name === 'credential_url')).toHaveLength(0)
  })
})

describe('checkSecrets — clean text', () => {
  it('returns has_secrets false for clean text', () => {
    const result = checkSecrets('This is a normal task description without any secrets.')
    expect(result.has_secrets).toBe(false)
    expect(result.matches).toHaveLength(0)
  })

  it('returns has_secrets false for empty string', () => {
    const result = checkSecrets('')
    expect(result.has_secrets).toBe(false)
    expect(result.matches).toHaveLength(0)
  })

  it('detects multiple secrets in one string', () => {
    const text = 'sk_abcdefghijklmnopqrstuvwx and password=mysecret'
    const result = checkSecrets(text)
    expect(result.has_secrets).toBe(true)
    expect(result.matches.length).toBeGreaterThanOrEqual(2)
  })
})

describe('redactSecrets', () => {
  it('replaces API key with [REDACTED]', () => {
    const result = redactSecrets('Use sk_abcdefghijklmnopqrstuvwx here')
    expect(result).not.toContain('sk_abcdefghijklmnopqrstuvwx')
    expect(result).toContain('[REDACTED]')
  })

  it('replaces password value with [REDACTED]', () => {
    const result = redactSecrets('password=supersecret123')
    expect(result).not.toContain('supersecret123')
    expect(result).toContain('[REDACTED]')
  })

  it('returns the original string unchanged when no secrets found', () => {
    const input = 'This is a normal task description.'
    const result = redactSecrets(input)
    expect(result).toBe(input)
  })

  it('redacts all occurrences when multiple secrets are present', () => {
    const input = 'sk_abcdefghijklmnopqrstuvwx and ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij'
    const result = redactSecrets(input)
    expect(result).not.toContain('sk_abcdefghijklmnopqrstuvwx')
    expect(result).not.toContain('ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij')
    const redactionCount = (result.match(/\[REDACTED\]/g) ?? []).length
    expect(redactionCount).toBeGreaterThanOrEqual(2)
  })
})
