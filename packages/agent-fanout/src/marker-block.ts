// Idempotent marker-block replace for agent-integration files (opencode.md,
// CLAUDE.md, AGENTS.md, GEMINI.md, PI.md). The installer owns the region
// between BEGIN/END markers and rewrites it on every run. Everything outside
// the markers is USER-OWNED and must survive verbatim.

export interface MarkerReplaceOptions {
  /**
   * Existing file contents. May be empty (new file) or already contain the
   * markers (idempotent re-run) or contain user-only content (first install).
   */
  existing: string
  /**
   * Fresh Fulcrum-managed content to place between the markers. Do NOT include
   * the markers yourself — replaceMarkerBlock emits them.
   */
  managed: string
  /**
   * Marker prefix. Defaults to "FULCRUM". The full markers are
   * `<!-- BEGIN <prefix> managed-block v1 -->` and
   * `<!-- END <prefix> managed-block v1 -->`.
   */
  prefix?: string
  /**
   * Placement when the file has no prior markers. Default 'end' appends a
   * fresh managed block at the bottom of existing content.
   */
  placement?: 'end' | 'start'
}

export interface MarkerReplaceResult {
  contents: string
  /**
   * True if the existing input already contained a managed block; false if
   * one was inserted fresh. Callers use this to emit different install log
   * lines (upgrade vs first-time install).
   */
  replacedExisting: boolean
}

const BEGIN_MARKER_RE = (prefix: string) =>
  new RegExp(`<!--\\s*BEGIN\\s+${escapeRe(prefix)}\\s+managed-block\\s+v1\\s*-->`, 'i')
const END_MARKER_RE = (prefix: string) =>
  new RegExp(`<!--\\s*END\\s+${escapeRe(prefix)}\\s+managed-block\\s+v1\\s*-->`, 'i')

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function replaceMarkerBlock(opts: MarkerReplaceOptions): MarkerReplaceResult {
  const prefix = opts.prefix ?? 'FULCRUM'
  const placement = opts.placement ?? 'end'
  const beginMarker = `<!-- BEGIN ${prefix} managed-block v1 -->`
  const endMarker = `<!-- END ${prefix} managed-block v1 -->`
  const block = `${beginMarker}\n${opts.managed.replace(/^\n+|\n+$/g, '')}\n${endMarker}`

  const beginRe = BEGIN_MARKER_RE(prefix)
  const endRe = END_MARKER_RE(prefix)
  const beginMatch = opts.existing.match(beginRe)
  const endMatch = opts.existing.match(endRe)

  if (beginMatch && endMatch && beginMatch.index! < endMatch.index!) {
    const before = opts.existing.slice(0, beginMatch.index!).replace(/\n+$/, '')
    const after = opts.existing.slice(endMatch.index! + endMatch[0].length).replace(/^\n+/, '')
    const joined = [before, block, after].filter((s) => s.length > 0).join('\n\n')
    return { contents: joined + '\n', replacedExisting: true }
  }

  const trimmed = opts.existing.replace(/^\n+|\n+$/g, '')
  if (!trimmed) {
    return { contents: block + '\n', replacedExisting: false }
  }
  const contents = placement === 'start'
    ? `${block}\n\n${trimmed}\n`
    : `${trimmed}\n\n${block}\n`
  return { contents, replacedExisting: false }
}
