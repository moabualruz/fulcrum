// AD-9e — secret-scan at parse.ts time. Patterns match common credential shapes
// that would leak into the fanout pipeline if a contributor pastes a token into
// a canonical skill or rule body.

export interface SecretMatch {
  pattern: string
  sample: string
  offset: number
}

const PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'anthropic-sk', regex: /sk-[a-zA-Z0-9_-]{20,}/g },
  { name: 'github-pat', regex: /ghp_[A-Za-z0-9]{20,}/g },
  { name: 'github-fine-grained', regex: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'slack-token', regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'aws-access-key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'bearer-token', regex: /Bearer\s+[A-Za-z0-9._~+/-]{20,}=*/g },
]

export class SecretDetectedError extends Error {
  constructor(public readonly path: string, public readonly matches: SecretMatch[]) {
    const summary = matches.map((m) => `${m.pattern} @${m.offset}`).join(', ')
    super(`Secret-like pattern detected in ${path}: ${summary}. Rotate the secret before committing.`)
    this.name = 'SecretDetectedError'
  }
}

export function scanForSecrets(path: string, content: string): void {
  const matches: SecretMatch[] = []
  for (const { name, regex } of PATTERNS) {
    for (const match of content.matchAll(regex)) {
      matches.push({
        pattern: name,
        sample: redact(match[0]),
        offset: match.index ?? 0,
      })
    }
  }
  if (matches.length > 0) throw new SecretDetectedError(path, matches)
}

function redact(raw: string): string {
  if (raw.length <= 10) return '*'.repeat(raw.length)
  return `${raw.slice(0, 6)}${'*'.repeat(raw.length - 10)}${raw.slice(-4)}`
}
