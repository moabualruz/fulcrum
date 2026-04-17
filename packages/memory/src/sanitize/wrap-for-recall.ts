// v2a PR 5 Task 33 (anticipated by Task 25's middleware) — wraps recall
// output in a verbatim `<fulcrum-recall trust="untrusted">…</fulcrum-recall>`
// fence so downstream agents recognize the boundary.

export interface RecallEntry {
  id?: string
  content?: string
  score?: number
  source?: string
  tags?: string[]
}

export interface WrapOptions {
  reason?: 'no_match' | 'below_floor'
  /** Optional max-chars per entry (defaults to 500). */
  maxChars?: number
}

export function wrapForRecall(entries: RecallEntry[], opts: WrapOptions = {}): string {
  const max = opts.maxChars ?? 500
  if (entries.length === 0 && opts.reason) {
    return `<fulcrum-recall trust="untrusted" reason="${opts.reason}"></fulcrum-recall>`
  }
  const lines = entries.map(e => {
    const id = e.id ? ` id="${e.id}"` : ''
    const score = typeof e.score === 'number' ? ` score="${e.score.toFixed(3)}"` : ''
    const body = (e.content ?? '').slice(0, max)
    return `<entry${id}${score}>${escapeXml(body)}</entry>`
  }).join('\n')
  return `<fulcrum-recall trust="untrusted">\n${lines}\n</fulcrum-recall>`
}

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
