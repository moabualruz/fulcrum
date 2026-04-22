import { getDb, newId } from 'fulcrum-agent-core'
import type { Db, RagEvalRunStatus } from 'fulcrum-agent-core'
import { redactRagDetails } from '../../setup/rag-redaction.js'
import {
  RAG_LIFECYCLE_EVAL_CATEGORIES,
  RAG_LIFECYCLE_EVAL_CORPUS,
  RAG_LIFECYCLE_EVAL_FIXTURES,
  observeRagLifecycleFixtureCorpus,
} from './fixtures.js'
import type {
  RagLifecycleEvalCorpus,
  RagLifecycleEvalCase,
  RagLifecycleEvalCategory,
  RagLifecycleEvalObservation,
  RagLifecycleEvalRequirement,
} from './fixtures.js'

export interface RagLifecycleEvalCategoryResult {
  passed: number
  failed: number
  skipped: number
}

export interface RagLifecycleEvalFailure {
  case_id: string
  category: RagLifecycleEvalCategory
  expected: unknown
  actual: unknown
}

export interface RagLifecycleEvalSkipped {
  case_id: string
  category: RagLifecycleEvalCategory
  reason: string
}

export interface RagLifecycleEvalRunResult {
  eval_run_id: string
  suite: 'rag-lifecycle'
  status: Exclude<RagEvalRunStatus, 'pending' | 'running' | 'cancelled'>
  results: Record<RagLifecycleEvalCategory, RagLifecycleEvalCategoryResult>
  failures: RagLifecycleEvalFailure[]
  skipped: RagLifecycleEvalSkipped[]
}

export type RagLifecycleEvalObserver = (
  testCase: RagLifecycleEvalCase
) => Promise<RagLifecycleEvalObservation> | RagLifecycleEvalObservation

export interface RunRagLifecycleEvalSuiteInput {
  workspace_id?: string
  project_id?: string
  cases?: RagLifecycleEvalCase[]
  corpus?: RagLifecycleEvalCorpus
  observer?: RagLifecycleEvalObserver
  include_model_heavy?: boolean
  include_accelerator_heavy?: boolean
  trigger_source?: 'local' | 'ci'
  trigger_scope?: 'rag_related' | 'non_rag' | 'manual'
  gate_required?: boolean
  db?: Db
}

function emptyResults(): Record<RagLifecycleEvalCategory, RagLifecycleEvalCategoryResult> {
  return Object.fromEntries(RAG_LIFECYCLE_EVAL_CATEGORIES.map(category => [
    category,
    { passed: 0, failed: 0, skipped: 0 },
  ])) as Record<RagLifecycleEvalCategory, RagLifecycleEvalCategoryResult>
}

function orderedEvalCases(cases: RagLifecycleEvalCase[]): RagLifecycleEvalCase[] {
  return [...cases].sort((a, b) => {
    if (a.category === 'operational_parity' && b.category !== 'operational_parity') return -1
    if (a.category !== 'operational_parity' && b.category === 'operational_parity') return 1
    return 0
  })
}

function hasEveryExpected(actual: string[] | undefined, expected: string[] | undefined): boolean {
  if (!expected || expected.length === 0) return true
  const actualSet = new Set(actual ?? [])
  return expected.every(id => actualSet.has(id))
}

function hasOrderedPrefix(actual: string[] | undefined, expected: string[] | undefined): boolean {
  if (!expected || expected.length === 0) return true
  const observed = actual ?? []
  return expected.every((id, index) => observed[index] === id)
}

function answerContains(actual: string | undefined, expected: string[] | undefined): boolean {
  if (!expected || expected.length === 0) return true
  const answer = (actual ?? '').toLowerCase()
  return expected.every(fragment => answer.includes(fragment.toLowerCase()))
}

function parityMatches(
  actual: Record<string, string> | undefined,
  expected: Record<string, string> | undefined,
): boolean {
  if (!expected) return true
  return Object.entries(expected).every(([name, status]) => actual?.[name] === status)
}

function actualForFailure(testCase: RagLifecycleEvalCase, observation: RagLifecycleEvalObservation): unknown {
  switch (testCase.category) {
    case 'retrieval_relevance':
    case 'ranking':
      return observation.retrieved_ids ?? []
    case 'answer_correctness':
      return observation.answer ?? ''
    case 'grounding_provenance':
      return {
        provenance_class: observation.provenance_class,
        source_ids: observation.source_ids ?? [],
      }
    case 'graph_expansion':
      return observation.graph_expanded_ids ?? []
    case 'operational_parity':
      return observation.parity ?? {}
  }
}

function expectedForFailure(testCase: RagLifecycleEvalCase): unknown {
  switch (testCase.category) {
    case 'retrieval_relevance':
      return testCase.expected.retrieved_ids ?? []
    case 'ranking':
      return testCase.expected.ordered_ids ?? []
    case 'answer_correctness':
      return testCase.expected.answer_contains ?? []
    case 'grounding_provenance':
      return {
        provenance_class: testCase.expected.provenance_class,
        source_ids: testCase.expected.source_ids ?? [],
      }
    case 'graph_expansion':
      return testCase.expected.graph_expanded_ids ?? []
    case 'operational_parity':
      return testCase.expected.parity ?? {}
  }
}

function errorForFailure(error: unknown): unknown {
  if (error instanceof Error) {
    return { error: error.message }
  }
  return { error: String(error) }
}

function evaluateCase(testCase: RagLifecycleEvalCase, observation: RagLifecycleEvalObservation): boolean {
  switch (testCase.category) {
    case 'retrieval_relevance':
      return hasEveryExpected(observation.retrieved_ids, testCase.expected.retrieved_ids)
    case 'ranking':
      return hasOrderedPrefix(observation.retrieved_ids, testCase.expected.ordered_ids)
    case 'answer_correctness':
      return answerContains(observation.answer, testCase.expected.answer_contains)
    case 'grounding_provenance':
      return observation.provenance_class === testCase.expected.provenance_class &&
        hasEveryExpected(observation.source_ids, testCase.expected.source_ids)
    case 'graph_expansion':
      return hasEveryExpected(observation.graph_expanded_ids, testCase.expected.graph_expanded_ids)
    case 'operational_parity':
      return parityMatches(observation.parity, testCase.expected.parity)
  }
}

function skipReason(
  requirements: RagLifecycleEvalRequirement[] | undefined,
  input: RunRagLifecycleEvalSuiteInput,
): string | null {
  if (!requirements || requirements.length === 0) return null
  const modelAllowed = input.include_model_heavy === true || process.env['FULCRUM_RAG_EVAL_MODEL_HEAVY'] === '1'
  const acceleratorAllowed = input.include_accelerator_heavy === true || process.env['FULCRUM_RAG_EVAL_ACCELERATOR_HEAVY'] === '1'
  if (requirements.includes('model') && !modelAllowed) return 'model-heavy eval skipped by default'
  if (requirements.includes('accelerator') && !acceleratorAllowed) return 'accelerator-heavy eval skipped by default'
  return null
}

function persistRunStart(input: {
  eval_run_id: string
  workspace_id: string
  project_id: string
  trigger_source: 'local' | 'ci'
  trigger_scope: 'rag_related' | 'non_rag' | 'manual'
  gate_required: boolean
}, db: Db): void {
  db.prepare(`
    INSERT INTO rag_eval_runs (
      eval_run_id, workspace_id, project_id, suite, status, trigger_source,
      trigger_scope, gate_required, started_at, results
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `).run(
    input.eval_run_id,
    input.workspace_id,
    input.project_id,
    'rag-lifecycle',
    'running',
    input.trigger_source,
    input.trigger_scope,
    input.gate_required ? 1 : 0,
    JSON.stringify({ suite: 'rag-lifecycle', status: 'running' }),
  )
}

function persistRunFinish(result: RagLifecycleEvalRunResult, db: Db): void {
  db.prepare(`
    UPDATE rag_eval_runs
       SET status = ?, finished_at = datetime('now'), results = ?
     WHERE eval_run_id = ?
  `).run(result.status, JSON.stringify(result), result.eval_run_id)
}

export async function runRagLifecycleEvalSuite(
  input: RunRagLifecycleEvalSuiteInput = {},
): Promise<RagLifecycleEvalRunResult> {
  const eval_run_id = newId('rag_eval_run')
  const results = emptyResults()
  const failures: RagLifecycleEvalFailure[] = []
  const skipped: RagLifecycleEvalSkipped[] = []
  const db = input.db ?? (input.workspace_id && input.project_id ? getDb() : undefined)

  if (db && input.workspace_id && input.project_id) {
    persistRunStart({
      eval_run_id,
      workspace_id: input.workspace_id,
      project_id: input.project_id,
      trigger_source: input.trigger_source ?? 'local',
      trigger_scope: input.trigger_scope ?? 'manual',
      gate_required: input.gate_required ?? false,
    }, db)
  }

  for (const testCase of orderedEvalCases(input.cases ?? RAG_LIFECYCLE_EVAL_FIXTURES)) {
    const reason = skipReason(testCase.requires, input)
    if (reason) {
      results[testCase.category].skipped += 1
      skipped.push({ case_id: testCase.case_id, category: testCase.category, reason })
      continue
    }

    let observation: RagLifecycleEvalObservation
    try {
      observation = input.observer
        ? await input.observer(testCase)
        : observeRagLifecycleFixtureCorpus(testCase, input.corpus ?? RAG_LIFECYCLE_EVAL_CORPUS)
    } catch (error) {
      results[testCase.category].failed += 1
      failures.push({
        case_id: testCase.case_id,
        category: testCase.category,
        expected: expectedForFailure(testCase),
        actual: errorForFailure(error),
      })
      continue
    }

    if (evaluateCase(testCase, observation)) {
      results[testCase.category].passed += 1
    } else {
      results[testCase.category].failed += 1
      failures.push({
        case_id: testCase.case_id,
        category: testCase.category,
        expected: expectedForFailure(testCase),
        actual: actualForFailure(testCase, observation),
      })
    }
  }

  const status = failures.length > 0 ? 'failed' : 'passed'
  const result = redactRagDetails({
    eval_run_id,
    suite: 'rag-lifecycle' as const,
    status,
    results,
    failures,
    skipped,
  }) as RagLifecycleEvalRunResult

  if (db && input.workspace_id && input.project_id) {
    persistRunFinish(result, db)
  }

  return result
}
