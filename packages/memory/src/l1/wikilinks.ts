// packages/memory/src/l1/wikilinks.ts
//
// Memory v3 PR 2 unit 2.4 — Obsidian-style `[[path]]` wikilink primitives.
//
// Wikilinks are the inline grounding mechanism for L1 pages: every claim
// derived from an L0 source carries an inline `[[raw/<type>/YYYY/MM/DD/<ULID>]]`
// so Obsidian users can click through and the validator (unit 2.3) can check
// that each entry in the frontmatter `sources:` array is also cited inline.
//
// Three operations, no state:
//   extractWikilinks(body)    → string[]
//   renderRawWikilink(parts)  → '[[raw/...]]'
//   resolveWikilink(link, vr) → absolute filesystem path
//
// A wikilink body is a single slash-segmented path; the prefix decides whether
// it resolves under `vault/raw/` or `vault/curated/<type>/`. Known prefixes:
//   raw/           → vault/raw/<rest>.md        (L0 source)
//   entity/<ulid>  → vault/curated/entities/<ulid>.md
//   page/<ulid>    → vault/curated/pages/<ulid>.md
//   concept/<ulid> → vault/curated/concepts/<ulid>.md
//   synthesis/<ulid> → vault/curated/synthesis/<ulid>.md
// Anything else throws — unknown prefixes are a validator error, not a silent
// fallthrough.

import { join, resolve, sep } from 'path'

export type L0WikilinkParts = {
  source_type: string
  ulid: string
  date: Date
}

// Match `[[<body>]]` where body is anything up to the next `]]`, non-greedy.
// The body may contain slashes, hyphens, underscores, digits, letters, and
// percent-escapes (LOW-22: filename path-encoding).
const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g

/**
 * Extract every `[[...]]` body from `text` in reading order. Duplicates are
 * preserved — callers dedup if they care. Malformed (unterminated) `[[` is
 * silently skipped.
 */
export function extractWikilinks(text: string): string[] {
  if (!text) return []
  const out: string[] = []
  let m: RegExpExecArray | null
  WIKILINK_RE.lastIndex = 0
  while ((m = WIKILINK_RE.exec(text)) !== null) {
    out.push(m[1]!)
  }
  return out
}

/**
 * Build a `[[raw/<source_type>/YYYY/MM/DD/<ULID>]]` wikilink string from its
 * date-sharded components. Months/days zero-padded to two digits.
 */
export function renderRawWikilink(parts: L0WikilinkParts): string {
  if (!parts.source_type) throw new Error('renderRawWikilink: source_type required')
  if (!parts.ulid) throw new Error('renderRawWikilink: ulid required')
  const yyyy = parts.date.getUTCFullYear().toString()
  const mm = String(parts.date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(parts.date.getUTCDate()).padStart(2, '0')
  return `[[raw/${parts.source_type}/${yyyy}/${mm}/${dd}/${parts.ulid}]]`
}

const CURATED_PREFIXES: Record<string, string> = {
  'entity/': 'curated/entities/',
  'page/': 'curated/pages/',
  'concept/': 'curated/concepts/',
  'synthesis/': 'curated/synthesis/',
}

/**
 * Resolve a wikilink body (without the surrounding `[[` `]]`) to an absolute
 * filesystem path under `vaultRoot`. Rejects path traversal, null bytes, and
 * unknown prefixes.
 */
export function resolveWikilink(link: string, vaultRoot: string): string {
  if (!link) throw new Error('resolveWikilink: empty link')
  if (link.includes('\0')) throw new Error('resolveWikilink: null byte in link')
  if (link.split('/').some((seg) => seg === '..' || seg === '.')) {
    throw new Error(`resolveWikilink: path traversal rejected: ${link}`)
  }

  let rel: string
  if (link.startsWith('raw/')) {
    rel = `${link}.md`
  } else {
    const prefix = Object.keys(CURATED_PREFIXES).find((p) => link.startsWith(p))
    if (!prefix) throw new Error(`resolveWikilink: unknown prefix in ${link}`)
    const mapped = CURATED_PREFIXES[prefix]!
    rel = `${mapped}${link.slice(prefix.length)}.md`
  }

  const abs = resolve(join(vaultRoot, rel))
  const rootAbs = resolve(vaultRoot) + sep
  if (!(abs + sep).startsWith(rootAbs) && abs !== resolve(vaultRoot)) {
    throw new Error(`resolveWikilink: path escapes vault root: ${abs}`)
  }
  return abs
}
