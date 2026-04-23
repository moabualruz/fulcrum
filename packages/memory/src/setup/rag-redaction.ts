import { createHash } from 'crypto'

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

const PATH_KEY_RE = /^(path|paths|file_path|artifact_path|profile_path|absolute_path|vault_path|db_path|graph_path|vector_path|report_path)(_operator_only)?$/i

function isLikelyAbsolutePath(value: string): boolean {
  return /^\/[^\s{}[\]]+/.test(value)
}

export function pathFingerprintForRoadmap(path: string): string {
  return `sha256:${createHash('sha256').update(path).digest('hex')}`
}

function redactInlineAbsolutePaths(value: string): string {
  return value.replace(/(^|[\s"'(:=])(\/[^\s"'{}[\],)]+)/g, (_match, prefix: string, path: string) => {
    return `${prefix}[REDACTED_PATH:${pathFingerprintForRoadmap(path)}]`
  })
}

function redactRoadmapString(value: string, forcePath: boolean): string {
  const secretRedacted = redactRagText(value)
  if ((forcePath && isLikelyAbsolutePath(secretRedacted)) || isLikelyAbsolutePath(secretRedacted)) {
    return `[REDACTED_PATH:${pathFingerprintForRoadmap(secretRedacted)}]`
  }
  return redactInlineAbsolutePaths(secretRedacted)
}

export function redactRoadmapArtifact<T>(value: T): T {
  const visit = (nested: unknown, key?: string): unknown => {
    if (typeof nested === 'string') return redactRoadmapString(nested, Boolean(key && PATH_KEY_RE.test(key)))
    if (Array.isArray(nested)) return nested.map(item => visit(item))
    if (!nested || typeof nested !== 'object') return nested

    const out: Record<string, unknown> = {}
    for (const [nestedKey, nestedValue] of Object.entries(nested as Record<string, unknown>)) {
      const normalized = nestedKey.toLowerCase().replace(/[^a-z0-9]/g, '_')
      if (SENSITIVE_KEYS.has(normalized)) {
        out[nestedKey] = '[REDACTED]'
      } else if (PATH_KEY_RE.test(normalized)) {
        out[nestedKey] = visit(nestedValue, normalized)
      } else {
        out[nestedKey] = visit(nestedValue, nestedKey)
      }
    }
    return out
  }

  return visit(value) as T
}
