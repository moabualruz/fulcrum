import { describe, expect, it } from 'vitest'
import { isRagEvalGateRequiredForPaths, RAG_EVAL_GATE_PATH_PATTERNS } from '../commands/memory-rag-eval.js'

describe('RAG roadmap gate path patterns', () => {
  it('requires RAG gates for memory, code search, embeddings, graph, eval fixtures, traces, CLI/MCP, and specs/002 changes', () => {
    const ragPaths = [
      'packages/memory/src/retrieval/search-context.ts',
      'packages/memory/src/retrieval/search-code.ts',
      'packages/memory/src/l2/embedding-jobs.ts',
      'packages/memory/src/graph/coverage.ts',
      'packages/memory/src/eval/live-rag/runner.ts',
      'packages/memory/src/eval/live-rag/fixtures.json',
      'packages/memory/src/retrieval/query-trace.ts',
      'packages/cli/src/commands/memory-rag-eval.ts',
      'packages/cli/src/tool-registry.ts',
      'packages/cli/src/mcp-tools.ts',
      'specs/002-rag-roadmap-delivery/spec.md',
      'specs/002-rag-roadmap-delivery/tasks.md',
    ]

    for (const path of ragPaths) {
      expect(isRagEvalGateRequiredForPaths([path]), path).toBe(true)
    }
  })

  it('does not require RAG gates for unrelated docs and monitor-only changes', () => {
    expect(isRagEvalGateRequiredForPaths([
      'docs/guides/worker-adapters.md',
      'packages/monitor/src/tests/metrics-extended.test.ts',
    ])).toBe(false)
  })

  it('documents explicit roadmap gate patterns for operator review', () => {
    expect(RAG_EVAL_GATE_PATH_PATTERNS).toEqual(expect.arrayContaining([
      'packages/memory/src/eval/**',
      'packages/memory/src/retrieval/query-trace.ts',
      'packages/memory/src/retrieval/search-code.ts',
      'packages/memory/src/retrieval/search-context.ts',
      'packages/memory/src/l2/**',
      'packages/memory/src/graph/**',
      'packages/cli/src/**',
      'specs/002-rag-roadmap-delivery/**',
    ]))
  })
})
