const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-api03-[A-Za-z0-9_-]{40,}/g,
  /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /(ghp|ghu|ghs|gho)_[A-Za-z0-9]{36}/g,
  /xox[baprs]-[0-9A-Za-z-]+/g,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9_+/=-]{20,}/gi,
  /(password|passwd|pwd|secret|api[_-]?key|token)\s*[=:]\s*[^,\s}]+/gi,
  /([A-Za-z][A-Za-z0-9+.-]+:\/\/)[^:@\s]+:[^@\s]{3,}@/g,
  /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH |)PRIVATE KEY-----/g,
]

const SENSITIVE_KEYS = new Set([
  'api_key',
  'apikey',
  'authorization',
  'client_secret',
  'password',
  'passwd',
  'private_key',
  'secret',
  'token',
])

export function redactRagText(text: string): string {
  let redacted = text
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    redacted = redacted.replace(pattern, '[REDACTED]')
    pattern.lastIndex = 0
  }
  return redacted
}

export function redactRagDetails<T>(value: T): T {
  if (typeof value === 'string') return redactRagText(value) as T
  if (Array.isArray(value)) return value.map(item => redactRagDetails(item)) as T
  if (!value || typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '_')
    out[key] = SENSITIVE_KEYS.has(normalized) ? '[REDACTED]' : redactRagDetails(nested)
  }
  return out as T
}

export function redactProviderConfig<T extends Record<string, unknown>>(config: T): T {
  return redactRagDetails(config)
}

