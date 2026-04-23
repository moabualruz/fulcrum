import { describe, expect, it } from 'vitest'
import {
  buildChallengerAvailability,
  getChallengerLaneContract,
  listChallengerLaneContracts,
} from '../runtime/challengers/contract.js'

describe('RAG challenger lane contract', () => {
  it('defines python and rust challengers under one shared planner/eval contract', async () => {
    const challengers = listChallengerLaneContracts()

    expect(challengers.map(challenger => challenger.lane.lane_id)).toEqual(['python-ml', 'rust-search'])
    for (const challenger of challengers) {
      expect(challenger.disabled_by_default).toBe(true)
      expect(challenger.contract_version).toBe('rag-challenger-v1')
      expect(challenger.eval_contract).toBe('roadmap-rag-eval-v1')
      expect(challenger.explain_contract).toBe('shared-rag-explain-v1')
      expect(challenger.lane.lane_type).toBe('challenger')
      expect(challenger.planner_stages.length).toBeGreaterThan(0)
      expect(await challenger.availability()).toMatchObject({
        status: 'disabled',
        scope: 'out_of_scope',
        local_baseline_impact: 'none',
      })
    }
  })

  it('resolves challengers by lane id or adapter name and redacts descriptors', async () => {
    const python = getChallengerLaneContract('python-ml')
    const rust = getChallengerLaneContract('rust-search')

    expect(python?.adapter.adapter_name).toBe('python-ml')
    expect(rust?.lane.lane_label).toContain('Rust')

    const availability = await buildChallengerAvailability({
      lane_id: 'python-ml',
      adapter_name: '/home/alice/private/python-ml',
      reason: 'candidate not configured; token=sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })

    expect(availability).toMatchObject({
      status: 'disabled',
      scope: 'out_of_scope',
      adapter_name: 'python-ml',
    })
    const json = JSON.stringify(availability)
    expect(json).not.toContain('/home/alice')
    expect(json).not.toContain('sk-proj-')
  })
})
