export interface SearchPlannerContract {
  workspace_id?: string
  project_id?: string
  limit?: number
  explain?: boolean
  persist?: boolean
}

export function shouldPersistPlannerArtifacts(input: SearchPlannerContract): boolean {
  return input.persist === true
}

export function assertPlannerPersistenceScope(input: SearchPlannerContract): asserts input is SearchPlannerContract & {
  workspace_id: string
  project_id: string
} {
  if (!input.workspace_id || !input.project_id) {
    const error = new Error('persist=true requires workspace_id and project_id')
    Object.assign(error, { code: 'invalid_scope', retryable: false })
    throw error
  }
}
