// v2a PR 5 Task 24 — threat-scanner port (Hermes pattern).
//
// Detects and redacts:
//   * Fence markers — `<fulcrum-recall>...</fulcrum-recall>` (strip)
//   * Prompt injection — IGNORE PREVIOUS INSTRUCTIONS, role hijack, system-
//     prompt spoofing
//   * Credentials — AWS keys, GitHub tokens, generic high-entropy secrets
//   * Invisible Unicode — BOM, ZWJ, bidi overrides (strip)
//
// Errors are non-fatal: the scanner returns the input unchanged + an error
// event so the writer can decide whether to surface or proceed.

export interface SanitizeEvent {
  rule: string
  severity: 'info' | 'warn' | 'error'
  match?: string
}

export interface ScanResult {
  redacted: string
  events: SanitizeEvent[]
}

const FENCE_RE = /<fulcrum-recall[^>]*>[\s\S]*?<\/fulcrum-recall>/gi

const INJECTION_PATTERNS: { rule: string; re: RegExp; severity: SanitizeEvent['severity'] }[] = [
  { rule: 'injection.ignore_previous', re: /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|messages)\b/gi, severity: 'warn' },
  { rule: 'injection.role_hijack', re: /\b(?:you\s+are\s+now|act\s+as|new\s+role)\s*[:=]\s*(?:system|admin|root|developer)\b/gi, severity: 'warn' },
  { rule: 'injection.system_spoof', re: /<\|\s*(?:system|user|assistant)\s*\|>/gi, severity: 'warn' },
  { rule: 'injection.disregard', re: /\bdisregard\s+(?:the\s+)?(?:above|previous|earlier|all)\b/gi, severity: 'warn' },
]

const CREDENTIAL_PATTERNS: { rule: string; re: RegExp; severity: SanitizeEvent['severity'] }[] = [
  // Order matters: highly-specific shapes (AWS access keys, vendor-prefixed
  // sk- / ghp_ tokens) must run BEFORE the generic 40-char base64 catchall
  // so the catchall doesn't shadow them.
  { rule: 'credential.aws_access_key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, severity: 'error' },
  { rule: 'credential.anthropic_key', re: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g, severity: 'error' },
  { rule: 'credential.openai_key', re: /\bsk-[A-Za-z0-9_-]{32,}\b/g, severity: 'error' },
  { rule: 'credential.github_token', re: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g, severity: 'error' },
  // AWS secret — 40 base64 chars. Generic; runs after the vendor prefixes.
  { rule: 'credential.aws_secret', re: /\b[A-Za-z0-9/+=]{40}\b(?=\s*(?:#|$|"|')?)/g, severity: 'warn' },
  // Generic Bearer token (Authorization: Bearer ...)
  { rule: 'credential.bearer_token', re: /\b(?:Authorization|Bearer)\s*[:=]?\s*[A-Za-z0-9._-]{20,}\b/gi, severity: 'warn' },
]

// Invisible Unicode: BOM, ZWJ, ZWSP, ZWNJ, RTL/LTR overrides
const INVISIBLE_UNICODE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g

const REDACTION_MARKER_INJECTION = '[…redacted: potential injection…]'
const REDACTION_MARKER_CREDENTIAL = '[…redacted: credential…]'

export function scanForThreats(content: string): ScanResult {
  const events: SanitizeEvent[] = []
  let redacted = content

  // 1. Strip fence markers (untrusted-context boundary leakage).
  redacted = redacted.replace(FENCE_RE, match => {
    events.push({ rule: 'fence.strip', severity: 'info', match: match.slice(0, 80) })
    return ''
  })

  // 2. Redact prompt-injection patterns.
  for (const { rule, re, severity } of INJECTION_PATTERNS) {
    redacted = redacted.replace(re, match => {
      events.push({ rule, severity, match: match.slice(0, 80) })
      return REDACTION_MARKER_INJECTION
    })
  }

  // 3. Redact credentials.
  for (const { rule, re, severity } of CREDENTIAL_PATTERNS) {
    redacted = redacted.replace(re, match => {
      events.push({ rule, severity, match: '<redacted>' }) // never echo the credential itself
      return REDACTION_MARKER_CREDENTIAL
    })
  }

  // 4. Strip invisible Unicode.
  if (INVISIBLE_UNICODE_RE.test(redacted)) {
    events.push({ rule: 'unicode.invisible_strip', severity: 'info' })
    redacted = redacted.replace(INVISIBLE_UNICODE_RE, '')
  }

  return { redacted, events }
}
