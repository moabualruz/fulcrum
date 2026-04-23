import { getChallengerLaneContract } from './contract.js'

export function getPythonMlChallengerLane() {
  const challenger = getChallengerLaneContract('python-ml')
  if (!challenger) throw new Error('python-ml challenger contract is not registered')
  return challenger
}
