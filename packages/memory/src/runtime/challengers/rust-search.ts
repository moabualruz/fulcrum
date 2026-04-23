import { getChallengerLaneContract } from './contract.js'

export function getRustSearchChallengerLane() {
  const challenger = getChallengerLaneContract('rust-search')
  if (!challenger) throw new Error('rust-search challenger contract is not registered')
  return challenger
}
