import type { RunRoadmapRagEvalSuiteInput, RoadmapRagEvalRunResult } from '../roadmap.js'
import { runRoadmapRagEvalSuite } from '../roadmap.js'

export type RunLiveRagEvalSuiteInput = Omit<RunRoadmapRagEvalSuiteInput, 'suite'>

export async function runLiveRagEvalSuite(input: RunLiveRagEvalSuiteInput): Promise<RoadmapRagEvalRunResult> {
  return runRoadmapRagEvalSuite({ ...input, suite: 'live-rag' })
}
