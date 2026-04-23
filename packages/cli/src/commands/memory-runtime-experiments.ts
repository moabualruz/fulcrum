import { getDb, projectIdsFromPath } from 'fulcrum-agent-core'
import type { Db, RuntimeExperimentStatus } from 'fulcrum-agent-core'
import {
  adoptRuntimeExperiment,
  buildRuntimeExperimentReport,
  listRuntimeExperiments,
  rollbackRuntimeExperiment,
} from 'fulcrum-memory'
import type { RuntimeExperiment, RuntimeExperimentReport } from 'fulcrum-memory'

export interface RuntimeExperimentCommandScope {
  workspace_id?: string
  project_id?: string
}

export interface ListRuntimeExperimentsCommandInput extends RuntimeExperimentCommandScope {
  status?: RuntimeExperimentStatus
  limit?: number
}

export interface ListRuntimeExperimentsCommandResult {
  workspace_id: string
  project_id: string
  disabled_by_default: true
  experiments: RuntimeExperiment[]
}

export interface RuntimeExperimentReportCommandInput extends RuntimeExperimentCommandScope {
  runtime_experiment_id: string
}

function resolveScope(input: RuntimeExperimentCommandScope): { workspace_id: string; project_id: string } {
  if (input.workspace_id && input.project_id) {
    return { workspace_id: input.workspace_id, project_id: input.project_id }
  }
  const ids = projectIdsFromPath(process.cwd())
  return {
    workspace_id: input.workspace_id ?? ids.workspace_id,
    project_id: input.project_id ?? ids.project_id,
  }
}

export function listRuntimeExperimentsCommand(
  input: ListRuntimeExperimentsCommandInput = {},
  db: Db = getDb(),
): ListRuntimeExperimentsCommandResult {
  const scope = resolveScope(input)
  return {
    ...scope,
    disabled_by_default: true,
    experiments: listRuntimeExperiments({
      ...scope,
      status: input.status,
      limit: input.limit,
    }, db),
  }
}

export function getRuntimeExperimentReportCommand(
  input: RuntimeExperimentReportCommandInput,
  db: Db = getDb(),
): RuntimeExperimentReport {
  const scope = resolveScope(input)
  return buildRuntimeExperimentReport({
    ...scope,
    runtime_experiment_id: input.runtime_experiment_id,
  }, db)
}

export function adoptRuntimeExperimentCommand(
  input: RuntimeExperimentReportCommandInput,
  db: Db = getDb(),
): RuntimeExperiment {
  const scope = resolveScope(input)
  return adoptRuntimeExperiment({
    ...scope,
    runtime_experiment_id: input.runtime_experiment_id,
  }, db)
}

export function rollbackRuntimeExperimentCommand(
  input: RuntimeExperimentReportCommandInput,
  db: Db = getDb(),
): RuntimeExperiment {
  const scope = resolveScope(input)
  return rollbackRuntimeExperiment({
    ...scope,
    runtime_experiment_id: input.runtime_experiment_id,
  }, db)
}
