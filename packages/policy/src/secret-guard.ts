// packages/policy/src/secret-guard.ts
import type { SecretScanResult, SecretMatch } from './types.js'

interface PatternDef {
  name: string
  regex: RegExp
}

// 11 secret detection patterns (parity with Python implementation)
const PATTERNS: PatternDef[] = [
  {
    name: 'anthropic_api_key',
    regex: /sk-ant-api03-[A-Za-z0-9_\-]{95}/g,
  },
  {
    name: 'openai_api_key',
    regex: /sk-[A-Za-z0-9]{48}/g,
  },
  {
    name: 'api_key',
    regex: /(sk|pk|api|key|token|secret)[-_][a-zA-Z0-9]{20,}/gi,
  },
  {
    name: 'aws_access_key',
    regex: /AKIA[0-9A-Z]{16}/g,
  },
  {
    name: 'aws_secret_key',
    regex: /aws_secret_access_key\s*[=:]\s*\S+/gi,
  },
  {
    name: 'private_key',
    regex: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/g,
  },
  {
    name: 'oauth_token',
    regex: /(ghp|ghu|ghs|gho)_[a-zA-Z0-9]{36}/g,
  },
  {
    name: 'slack_token',
    regex: /xox[baprs]-[0-9A-Za-z\-]+/g,
  },
  {
    name: 'jwt_token',
    regex: /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
  },
  {
    name: 'password_kv',
    regex: /(password|passwd|pwd|secret)\s*[=:]\s*\S+/gi,
  },
  {
    name: 'credential_url',
    regex: /[a-zA-Z][a-zA-Z0-9+\-.]+:\/\/[^:@\s]+:[^@\s]{3,}@/g,
  },
]

export function checkSecrets(text: string): SecretScanResult {
  const matches: SecretMatch[] = []

  for (const pattern of PATTERNS) {
    // Reset regex state between calls (g flag keeps lastIndex)
    pattern.regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.regex.exec(text)) !== null) {
      matches.push({
        pattern_name: pattern.name,
        match: match[0],
        index: match.index,
      })
    }
    pattern.regex.lastIndex = 0
  }

  return {
    has_secrets: matches.length > 0,
    matches,
  }
}

export function redactSecrets(text: string): string {
  let result = text
  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0
    result = result.replace(pattern.regex, '[REDACTED]')
    pattern.regex.lastIndex = 0
  }
  return result
}
