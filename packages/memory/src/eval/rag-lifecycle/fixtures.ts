export const RAG_LIFECYCLE_EVAL_CATEGORIES = [
  'retrieval_relevance',
  'ranking',
  'answer_correctness',
  'grounding_provenance',
  'graph_expansion',
  'operational_parity',
] as const

export type RagLifecycleEvalCategory = typeof RAG_LIFECYCLE_EVAL_CATEGORIES[number]
export type RagLifecycleEvalRequirement = 'model' | 'accelerator'
export type RagLifecycleParityStatus = 'pass' | 'fail'

export interface RagLifecycleEvalMemoryFixture {
  memory_id: string
  title: string
  content: string
  match_queries: string[]
  provenance_class: 'raw-backed' | 'curated-backed' | 'code-backed' | 'legacy-unbacked' | 'generated'
  source_ids: string[]
  rank?: number
  ranking_scores?: Record<string, number>
  superseded_by?: string
}

export interface RagLifecycleEvalCodeChunkFixture {
  chunk_id: string
  file_path: string
  symbol_path: string
  content: string
  match_queries: string[]
  rank?: number
}

export interface RagLifecycleEvalCorpus {
  memories: RagLifecycleEvalMemoryFixture[]
  code_chunks: RagLifecycleEvalCodeChunkFixture[]
  answers: Record<string, string>
  graph_expansions: Record<string, string[]>
  parity: Record<string, RagLifecycleParityStatus>
}

export interface RagLifecycleEvalObservation {
  retrieved_ids?: string[]
  answer?: string
  provenance_class?: 'raw-backed' | 'curated-backed' | 'code-backed' | 'legacy-unbacked' | 'generated'
  source_ids?: string[]
  graph_expanded_ids?: string[]
  parity?: Record<string, RagLifecycleParityStatus>
}

export interface RagLifecycleEvalExpected {
  retrieved_ids?: string[]
  ordered_ids?: string[]
  answer_contains?: string[]
  provenance_class?: RagLifecycleEvalObservation['provenance_class']
  source_ids?: string[]
  graph_expanded_ids?: string[]
  parity?: Record<string, RagLifecycleParityStatus>
}

export interface RagLifecycleEvalCase {
  case_id: string
  category: RagLifecycleEvalCategory
  description: string
  query?: string
  requires?: RagLifecycleEvalRequirement[]
  expected: RagLifecycleEvalExpected
  default_observation?: RagLifecycleEvalObservation
}

export const RAG_LIFECYCLE_EVAL_CORPUS: RagLifecycleEvalCorpus = {
  memories: [
    {
      memory_id: 'mem_snapshot_contract',
      title: 'Rebuild promotion revalidates source snapshots',
      content: 'Full RAG rebuild promotion must revalidate canonical source identities and content hashes before serving candidate state.',
      match_queries: ['why must rebuild promotion revalidate source snapshots'],
      provenance_class: 'raw-backed',
      source_ids: ['src_rebuild_snapshot_contract'],
      rank: 1,
    },
    {
      memory_id: 'mem_rebuild_report',
      title: 'Rebuild reports include parity and candidate disposition',
      content: 'A rebuild report records scope, stages, parity checks, errors, and whether a candidate was promoted or quarantined.',
      match_queries: [
        'why must rebuild promotion revalidate source snapshots',
        'how are rebuild reports and candidate promotion connected',
      ],
      provenance_class: 'curated-backed',
      source_ids: ['src_rag_lifecycle_plan'],
      rank: 2,
    },
    {
      memory_id: 'mem_stale_snapshot_contract',
      title: 'Superseded rebuild snapshot note',
      content: 'Old rebuild snapshot guidance was replaced by the current source-snapshot revalidation contract.',
      match_queries: ['why must rebuild promotion revalidate source snapshots'],
      provenance_class: 'curated-backed',
      source_ids: ['src_stale_snapshot_note'],
      rank: 0,
      superseded_by: 'mem_snapshot_contract',
    },
    {
      memory_id: 'mem_vector_metadata',
      title: 'Vector metadata freshness contract',
      content: 'Vector metadata marks source rows current or stale by content hash, model, provider, device, and dimensions.',
      match_queries: [
        'why must rebuild promotion revalidate source snapshots',
        'what source backs the vector metadata freshness contract',
      ],
      provenance_class: 'raw-backed',
      source_ids: ['src_vector_metadata_contract', 'src_rag_lifecycle_plan'],
      rank: 3,
    },
    {
      memory_id: 'mem_degraded_retry',
      title: 'Embedding degraded retry handles failed items only',
      content: 'Retrying a degraded embedding job reprocesses failed or stale eligible items without repeating completed current items.',
      match_queries: ['embedding job degraded retry failed items only'],
      provenance_class: 'raw-backed',
      source_ids: ['src_embedding_job_contract'],
      ranking_scores: { 'embedding job degraded retry failed items only': 100 },
    },
    {
      memory_id: 'mem_embedding_job_ledger',
      title: 'Embedding job ledger records item status',
      content: 'Embedding job items persist source identity, content hash, model intent, attempts, and retry eligibility.',
      match_queries: ['embedding job degraded retry failed items only'],
      provenance_class: 'curated-backed',
      source_ids: ['src_embedding_job_contract'],
      ranking_scores: { 'embedding job degraded retry failed items only': 80 },
    },
    {
      memory_id: 'mem_rag_health_background',
      title: 'RAG health report background',
      content: 'RAG health reports summarize coverage and recommended maintenance actions across memory, code, vectors, and graph.',
      match_queries: ['embedding job degraded retry failed items only'],
      provenance_class: 'curated-backed',
      source_ids: ['src_rag_health_contract'],
      ranking_scores: { 'embedding job degraded retry failed items only': 10 },
    },
  ],
  code_chunks: [
    {
      chunk_id: 'chunk_rebuild_candidate_promote',
      file_path: 'packages/memory/src/setup/rag-lifecycle.ts',
      symbol_path: 'runRagRebuild.promoteCandidate',
      content: 'Promote staged rebuild candidates only after parity passes; quarantine failed candidates.',
      match_queries: [
        'where does candidate promotion quarantine failed rebuilds',
        'how are rebuild reports and candidate promotion connected',
      ],
      rank: 1,
    },
    {
      chunk_id: 'chunk_rebuild_snapshot_guard',
      file_path: 'packages/memory/src/setup/rag-lifecycle.ts',
      symbol_path: 'runRagRebuild.verifySnapshot',
      content: 'Before promotion, compare input snapshot hashes with current canonical sources.',
      match_queries: ['where does candidate promotion quarantine failed rebuilds'],
      rank: 2,
    },
  ],
  answers: {
    'rag-answer-001': 'The default RAG lifecycle eval is local and deterministic; model-heavy and accelerator-heavy checks are opt-in.',
  },
  graph_expansions: {
    'how does graph expansion connect rebuild health and vector freshness': [
      'ent_rebuild_report',
      'ent_vector_metadata',
      'ent_rag_health',
    ],
  },
  parity: {
    l0_l1: 'pass',
    code_chunks: 'pass',
    vectors: 'pass',
  },
}

export const RAG_LIFECYCLE_EVAL_FIXTURES: RagLifecycleEvalCase[] = [
  {
    case_id: 'rag-memory-recall-001',
    category: 'retrieval_relevance',
    description: 'memory recall returns the canonical rebuild decision memory',
    query: 'why must rebuild promotion revalidate source snapshots',
    expected: { retrieved_ids: ['mem_snapshot_contract'] },
  },
  {
    case_id: 'rag-code-search-001',
    category: 'retrieval_relevance',
    description: 'code search returns the canonical code chunk for staged candidate promotion',
    query: 'where does candidate promotion quarantine failed rebuilds',
    expected: { retrieved_ids: ['chunk_rebuild_candidate_promote'] },
  },
  {
    case_id: 'rag-hybrid-recall-001',
    category: 'retrieval_relevance',
    description: 'hybrid recall returns both memory and code evidence for related lifecycle concepts',
    query: 'how are rebuild reports and candidate promotion connected',
    expected: { retrieved_ids: ['mem_rebuild_report', 'chunk_rebuild_candidate_promote'] },
  },
  {
    case_id: 'rag-ranking-001',
    category: 'ranking',
    description: 'hybrid retrieval ranks exact lifecycle contract matches before broad background hits',
    query: 'embedding job degraded retry failed items only',
    expected: { ordered_ids: ['mem_degraded_retry', 'mem_embedding_job_ledger', 'mem_rag_health_background'] },
  },
  {
    case_id: 'rag-answer-001',
    category: 'answer_correctness',
    description: 'answer summarizes default eval behavior without requiring models or accelerators',
    query: 'what should the default rag lifecycle eval suite require',
    expected: {
      answer_contains: ['local', 'deterministic', 'opt-in'],
    },
  },
  {
    case_id: 'rag-provenance-001',
    category: 'grounding_provenance',
    description: 'retrieved lifecycle claim traces to raw-backed source provenance',
    query: 'what source backs the vector metadata freshness contract',
    expected: {
      provenance_class: 'raw-backed',
      source_ids: ['src_vector_metadata_contract'],
    },
  },
  {
    case_id: 'rag-graph-001',
    category: 'graph_expansion',
    description: 'graph expansion includes linked rebuild, vector metadata, and health concepts',
    query: 'how does graph expansion connect rebuild health and vector freshness',
    expected: {
      graph_expanded_ids: ['ent_rebuild_report', 'ent_vector_metadata', 'ent_rag_health'],
    },
  },
  {
    case_id: 'rag-parity-001',
    category: 'operational_parity',
    description: 'post-rebuild operational parity checks pass for canonical derived state',
    expected: {
      parity: {
        l0_l1: 'pass',
        code_chunks: 'pass',
        vectors: 'pass',
      },
    },
  },
]

function matchesQuery(query: string | undefined, matchQueries: string[]): boolean {
  if (!query) return false
  return matchQueries.includes(query)
}

function rankedByFixtureRank<T extends { rank?: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
}

export function observeRagLifecycleFixtureCorpus(
  testCase: RagLifecycleEvalCase,
  corpus: RagLifecycleEvalCorpus = RAG_LIFECYCLE_EVAL_CORPUS,
): RagLifecycleEvalObservation {
  switch (testCase.category) {
    case 'retrieval_relevance': {
      const memoryIds = rankedByFixtureRank(corpus.memories.filter(memory =>
        matchesQuery(testCase.query, memory.match_queries) && !memory.superseded_by,
      )).map(memory => memory.memory_id)
      const codeIds = rankedByFixtureRank(corpus.code_chunks.filter(chunk =>
        matchesQuery(testCase.query, chunk.match_queries),
      )).map(chunk => chunk.chunk_id)
      const retrieved_ids = [...memoryIds, ...codeIds]
      if (retrieved_ids.length === 0 && testCase.default_observation) return testCase.default_observation
      return { retrieved_ids }
    }
    case 'ranking': {
      const query = testCase.query ?? ''
      const retrieved_ids = corpus.memories
        .map(memory => ({ id: memory.memory_id, score: memory.ranking_scores?.[query] }))
        .filter((entry): entry is { id: string; score: number } => typeof entry.score === 'number')
        .sort((a, b) => b.score - a.score)
        .map(entry => entry.id)
      if (retrieved_ids.length === 0 && testCase.default_observation) return testCase.default_observation
      return { retrieved_ids }
    }
    case 'answer_correctness':
      return { answer: corpus.answers[testCase.case_id] ?? testCase.default_observation?.answer ?? '' }
    case 'grounding_provenance': {
      const memory = rankedByFixtureRank(corpus.memories.filter(item =>
        matchesQuery(testCase.query, item.match_queries),
      ))[0]
      if (!memory) return testCase.default_observation ?? { source_ids: [] }
      return {
        provenance_class: memory.provenance_class,
        source_ids: memory.source_ids,
      }
    }
    case 'graph_expansion':
      return { graph_expanded_ids: corpus.graph_expansions[testCase.query ?? ''] ?? testCase.default_observation?.graph_expanded_ids ?? [] }
    case 'operational_parity':
      return { parity: corpus.parity }
  }
}
