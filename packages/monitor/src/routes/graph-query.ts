// PR 19 Task 10.1 — GET /graph/query?cypher= with read-only Cypher allowlist.
//
// Security: true allowlist. The query MUST start with MATCH / RETURN / WITH /
// UNWIND / USE / EXPLAIN / PROFILE, MUST NOT contain any mutation, I/O, or
// extension-loading keyword, and MUST be <= MAX_CYPHER_LENGTH chars. Loopback-
// binding invariant per critical constraint #9.
//
// HIGH-10: the prior denylist missed COPY FROM/TO (filesystem read/write),
// REMOVE, DROP, LOAD EXTENSION, INSTALL, IMPORT DATABASE, EXPORT DATABASE,
// DETACH. It also didn't require the query to START with a read keyword — a
// comment or whitespace could bury CREATE at the top. Fixed by requiring the
// opening keyword to be in an allowlist and stripping comments + Unicode-
// lookalike lowercase mapping before checking.

export class CypherDeniedError extends Error {
  readonly status = 400
  constructor(reason: string) {
    super(`Cypher denied: ${reason}`)
    this.name = 'CypherDeniedError'
  }
}

const MAX_CYPHER_LENGTH = 2000

/** Keywords that open a read-only Cypher query. */
const ALLOWED_LEAD_KEYWORDS = new Set(['match', 'return', 'with', 'unwind', 'use', 'explain', 'profile'])

/** Any of these keywords anywhere in the (comment-stripped) query is a reject. */
const DENY_KEYWORDS = [
  'create', 'merge', 'delete', 'detach', 'set', 'remove', 'drop',
  'load\\s+csv', 'load\\s+extension', 'install', 'import\\s+database', 'export\\s+database',
  'copy\\s+from', 'copy\\s+to', 'copy\\s+mytable', 'copy\\s+',
  'call\\s+\\{', 'call\\s+apoc', 'call\\s+java', 'call\\s+dbms', 'call\\s+db\\.', 'call\\s+cypher',
]

const DENY_KEYWORD_RE = new RegExp(`\\b(?:${DENY_KEYWORDS.join('|')})\\b`, 'i')

/** Strip /* ... *\/ block comments and `// ...` line comments. */
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
}

/**
 * Normalise the query by (a) stripping comments, (b) normalizing Unicode full-
 * width and related lookalikes to ASCII lowercase so attacks like `ＣＲＥＡＴＥ`
 * collapse to `create` before the deny check, (c) collapsing whitespace.
 */
function normaliseForCheck(s: string): string {
  const stripped = stripComments(s)
  // NFKD folds fullwidth forms to ASCII equivalents; lowercase then combines
  // with the case-insensitive deny regex for belt-and-braces matching.
  const folded = stripped.normalize('NFKD').toLowerCase()
  return folded.replace(/\s+/g, ' ').trim()
}

/**
 * Validates a Cypher query string against the read-only allowlist.
 * Throws CypherDeniedError if the query is disallowed.
 */
export function validateCypher(cypher: string): void {
  if (typeof cypher !== 'string') throw new CypherDeniedError('cypher must be a string')
  const trimmed = cypher.trim()

  if (!trimmed) throw new CypherDeniedError('empty query')
  if (trimmed.length > MAX_CYPHER_LENGTH) {
    throw new CypherDeniedError(`query exceeds max length of ${MAX_CYPHER_LENGTH} chars`)
  }

  // HIGH-10: reject semicolons to block multi-statement payloads like
  // `MATCH (n) RETURN n; DROP TABLE Memory`.
  if (trimmed.includes(';')) {
    throw new CypherDeniedError('multi-statement queries are not permitted')
  }

  const normalised = normaliseForCheck(trimmed)

  // Leading keyword must be one of ALLOWED_LEAD_KEYWORDS.
  const leadMatch = normalised.match(/^([a-z]+)/)
  const leadKeyword = leadMatch?.[1] ?? ''
  if (!ALLOWED_LEAD_KEYWORDS.has(leadKeyword)) {
    throw new CypherDeniedError(`query must start with one of: ${[...ALLOWED_LEAD_KEYWORDS].join(', ')} (got: "${leadKeyword}")`)
  }

  // Mutation / I/O / extension-loading keywords anywhere in the query = reject.
  const denyMatch = normalised.match(DENY_KEYWORD_RE)
  if (denyMatch) {
    throw new CypherDeniedError(`contains disallowed keyword: ${denyMatch[0]}`)
  }
}

/** Route handler: GET /graph/query?cypher= */
export async function handleGraphQuery(
  cypher: string | undefined,
  kuzuQuery: (q: string) => Promise<unknown[]>,
): Promise<{ results: unknown[] } | { error: string; status: number }> {
  if (!cypher) {
    return { error: 'Missing cypher parameter', status: 400 }
  }

  try {
    validateCypher(cypher)
  } catch (err) {
    if (err instanceof CypherDeniedError) {
      return { error: err.message, status: 400 }
    }
    throw err
  }

  const results = await kuzuQuery(cypher)
  return { results }
}
