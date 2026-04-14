// packages/memory/src/eval/queries.ts
// 25 eval query cases, each with a query string and set of relevant fixture IDs.

export interface QueryCase {
  id: string
  query: string
  /** IDs from EVAL_FIXTURES that should appear in top-5 results */
  relevant: string[]
}

export const QUERY_CASES: QueryCase[] = [
  {
    id: 'q01',
    query: 'where is data stored in Fulcrum',
    relevant: ['fix_01', 'fix_05', 'fix_20', 'fix_34'],
  },
  {
    id: 'q02',
    query: 'graph database Kuzu semantic layer',
    relevant: ['fix_02', 'fix_34', 'fix_17'],
  },
  {
    id: 'q03',
    query: 'MCP protocol version SDK',
    relevant: ['fix_04', 'fix_26'],
  },
  {
    id: 'q04',
    query: 'why no .fulcrum project directories',
    relevant: ['fix_05', 'fix_20'],
  },
  {
    id: 'q05',
    query: 'FTS5 search error special characters fallback',
    relevant: ['fix_06'],
  },
  {
    id: 'q06',
    query: 'circular dependency core and memory packages',
    relevant: ['fix_07'],
  },
  {
    id: 'q07',
    query: 'how to build packages tsup',
    relevant: ['fix_08', 'fix_31'],
  },
  {
    id: 'q08',
    query: 'agent definitions schema migration table',
    relevant: ['fix_09', 'fix_21'],
  },
  {
    id: 'q09',
    query: 'Claude Code subagent markdown files roles',
    relevant: ['fix_10', 'fix_43'],
  },
  {
    id: 'q10',
    query: 'session lifecycle hooks start stop compact',
    relevant: ['fix_12', 'fix_27'],
  },
  {
    id: 'q11',
    query: 'recall memory modes compact full timeline',
    relevant: ['fix_13', 'fix_22'],
  },
  {
    id: 'q12',
    query: 'writeMemory title summary required fields',
    relevant: ['fix_14', 'fix_23'],
  },
  {
    id: 'q13',
    query: 'RRF reciprocal rank fusion scoring hybrid',
    relevant: ['fix_15'],
  },
  {
    id: 'q14',
    query: 'SQLite WAL mode concurrent reads locked',
    relevant: ['fix_16'],
  },
  {
    id: 'q15',
    query: 'Kuzu upsert pattern delete create memory node',
    relevant: ['fix_17'],
  },
  {
    id: 'q16',
    query: 'vitest forks pool native addons better-sqlite3',
    relevant: ['fix_18'],
  },
  {
    id: 'q17',
    query: 'ULID ID prefix task run memory workspace',
    relevant: ['fix_19'],
  },
  {
    id: 'q18',
    query: 'workspace isolation single global database',
    relevant: ['fix_20', 'fix_05', 'fix_29'],
  },
  {
    id: 'q19',
    query: 'Zod strict validation MCP tool schemas',
    relevant: ['fix_26'],
  },
  {
    id: 'q20',
    query: 'memory layers L0 vault L1 sqlite L2 kuzu',
    relevant: ['fix_34', 'fix_01', 'fix_02'],
  },
  {
    id: 'q21',
    query: 'content hash SHA256 deduplication',
    relevant: ['fix_35'],
  },
  {
    id: 'q22',
    query: 'chief of staff role restrictions cannot write code',
    relevant: ['fix_39', 'fix_38'],
  },
  {
    id: 'q23',
    query: 'setup install Claude Code hooks agents',
    relevant: ['fix_44', 'fix_43'],
  },
  {
    id: 'q24',
    query: 'madge circular import detection CI check',
    relevant: ['fix_30', 'fix_45'],
  },
  {
    id: 'q25',
    query: 'recall@5 evaluation metric retrieval quality',
    relevant: ['fix_49'],
  },
]
