// packages/policy/src/secret-guard.ts
import type { SecretScanResult, SecretMatch } from './types.js'

interface PatternDef {
  name: string
  regex: RegExp
}

// Secret detection patterns (parity with Python implementation)
// Order matters: more-specific patterns first so deduplication keeps them over generic matches.
const PATTERNS: PatternDef[] = [
  {
    // Anthropic API keys: sk-ant-api03-<80+ chars>. Must precede authorization_bearer.
    name: 'anthropic_api_key',
    regex: /sk-ant-api03-[A-Za-z0-9_\-]{80,}/g,
  },
  {
    // OpenAI API keys: sk-<40+ chars> or sk-proj-<40+ chars>. Must precede authorization_bearer.
    name: 'openai_api_key',
    regex: /sk-(?:proj-)?[A-Za-z0-9_\-]{40,}/g,
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
  {
    name: 'authorization_bearer',
    regex: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9\-_+/]{20,}/gi,
  },
]

export function checkSecrets(text: string): SecretScanResult {
  const rawMatches: SecretMatch[] = []

  for (const pattern of PATTERNS) {
    // Reset regex state between calls (g flag keeps lastIndex)
    pattern.regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.regex.exec(text)) !== null) {
      rawMatches.push({
        pattern_name: pattern.name,
        match: match[0],
        index: match.index,
      })
    }
    pattern.regex.lastIndex = 0
  }

  // Deduplicate: remove any match whose range is fully covered by another match.
  // Patterns are ordered from most-specific to least-specific, so an earlier match
  // (higher specificity) takes precedence over a later one that covers the same range.
  const matches = rawMatches.filter((candidate, i) => {
    const cStart = candidate.index
    const cEnd = candidate.index + candidate.match.length
    return !rawMatches.some((other, j) => {
      if (i === j) return false
      const oStart = other.index
      const oEnd = other.index + other.match.length
      // Keep candidate only if no other match fully covers it (and that other match
      // appears earlier in the array, meaning it's a higher-specificity pattern).
      return j < i && oStart <= cStart && oEnd >= cEnd
    })
  })

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
