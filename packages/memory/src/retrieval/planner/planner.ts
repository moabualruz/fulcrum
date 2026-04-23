import { newId } from 'fulcrum-agent-core'
import { assertPlannerPersistenceScope, shouldPersistPlannerArtifacts, type SearchPlannerContract } from './contract.js'

export interface SearchPlannerExecution extends SearchPlannerContract {
  query_trace_id: string
  explain: boolean
  persist: boolean
}

export function startSearchPlannerExecution<T extends SearchPlannerContract & { query_trace_id?: string }>(
  input: T,
): Omit<T, 'query_trace_id' | 'explain' | 'persist'> & SearchPlannerExecution {
  const execution: Omit<T, 'query_trace_id' | 'explain' | 'persist'> & SearchPlannerExecution = {
    ...input,
    query_trace_id: input.query_trace_id ?? newId('rag_query_trace'),
    explain: input.explain === true,
    persist: shouldPersistPlannerArtifacts(input),
  }

  if (execution.persist) assertPlannerPersistenceScope(execution)
  return execution
}
