// PR 19 Task 10.1 — GET /graph/query?cypher= with read-only Cypher allowlist.
//
// Security: rejects LOAD CSV, CREATE, MERGE, DELETE, SET, filesystem CALL.
// Loopback-binding invariant per critical constraint #9.

export class CypherDeniedError extends Error {
  readonly status = 400
  constructor(reason: string) {
    super(`Cypher denied: ${reason}`)
    this.name = 'CypherDeniedError'
  }
}

const MAX_CYPHER_LENGTH = 2000

/** Write keywords that are never allowed in the allowlist. */
const DISALLOWED_PATTERNS: RegExp[] = [
  /\bcreate\b/i,
  /\bmerge\b/i,
  /\bdelete\b/i,
  /\bset\b/i,
  /\bload\s+csv\b/i,
  /\bcall\s+\{/i,       // CALL { ... } subquery (may contain mutations)
  /\bcall\s+apoc\b/i,   // APOC procedures (filesystem/exec access)
  /\bcall\s+java\b/i,   // Java reflection calls
  /\bcall\s+dbms\b/i,   // DBMS management procedures
]

/**
 * Validates a Cypher query string against the read-only allowlist.
 * Throws CypherDeniedError if the query is disallowed.
 */
export function validateCypher(cypher: string): void {
  const trimmed = cypher.trim()

  if (!trimmed) {
    throw new CypherDeniedError('empty query')
  }

  if (trimmed.length > MAX_CYPHER_LENGTH) {
    throw new CypherDeniedError(`query exceeds max length of ${MAX_CYPHER_LENGTH} chars`)
  }

  for (const pattern of DISALLOWED_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new CypherDeniedError(`contains disallowed keyword (pattern: ${pattern.source})`)
    }
  }
}

/** Route handler: GET /graph/query?cypher= */
export async function handleGraphQuery(
  cypher: string | undefined,
  kuzuQuery: (q: string) => Promise<unknown[]>
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
