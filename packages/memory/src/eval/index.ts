// packages/memory/src/eval/index.ts
export { EVAL_FIXTURES } from './fixtures.js'
export type { EvalMemory } from './fixtures.js'
export { QUERY_CASES } from './queries.js'
export type { QueryCase } from './queries.js'
export { recallAtK, precisionAtK, mrr, ndcg, aggregate } from './metrics.js'
export type { EvalResult, AggregateResult } from './metrics.js'
export {
  RAG_LIFECYCLE_EVAL_CORPUS,
  RAG_LIFECYCLE_EVAL_CATEGORIES,
  RAG_LIFECYCLE_EVAL_FIXTURES,
  observeRagLifecycleFixtureCorpus,
} from './rag-lifecycle/fixtures.js'
export type {
  RagLifecycleEvalCase,
  RagLifecycleEvalCategory,
  RagLifecycleEvalCodeChunkFixture,
  RagLifecycleEvalCorpus,
  RagLifecycleEvalExpected,
  RagLifecycleEvalMemoryFixture,
  RagLifecycleEvalObservation,
  RagLifecycleEvalRequirement,
} from './rag-lifecycle/fixtures.js'
export { runRagLifecycleEvalSuite } from './rag-lifecycle/runner.js'
export type {
  RagLifecycleEvalCategoryResult,
  RagLifecycleEvalFailure,
  RagLifecycleEvalObserver,
  RagLifecycleEvalRunResult,
  RagLifecycleEvalSkipped,
  RunRagLifecycleEvalSuiteInput,
} from './rag-lifecycle/runner.js'
