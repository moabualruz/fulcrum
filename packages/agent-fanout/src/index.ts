export const VERSION = '0.0.3'

export { parseCanonicalSource } from './parse.js'
export type { ParseOptions } from './parse.js'

export { emitClaude } from './emit/claude.js'
export { emitPi } from './emit/pi.js'
export { emitCodex } from './emit/codex.js'
export { emitGemini } from './emit/gemini.js'
export { emitOpencode } from './emit/opencode.js'
export { emitCopilot } from './emit/copilot.js'
export { emitCursor } from './emit/cursor.js'
export { emitWindsurf, WindsurfSizeError, WINDSURF_MAX_BYTES } from './emit/windsurf.js'

export { scanForSecrets, SecretDetectedError } from './secret-scan.js'
export type { SecretMatch } from './secret-scan.js'

export { replaceMarkerBlock } from './marker-block.js'
export type { MarkerReplaceOptions, MarkerReplaceResult } from './marker-block.js'

export { computeRiderSha, writeRidersum } from './ridersum.js'
export type { RiderShaResult, RidersumWriteResult } from './ridersum.js'

export {
  appendJournal,
  readJournal,
  clearJournal,
  globalStateDir,
  journalPath,
  isGlobalAgent,
  sha256File,
  newRunId,
} from './install-journal.js'
export type {
  InstallJournalEntry,
  InstallAction,
  InstallMode as JournalInstallMode,
  ReadJournalOpts,
} from './install-journal.js'

export { ALL_TARGETS } from './types.js'
export type {
  AgentTarget,
  CanonicalSkill,
  CanonicalRule,
  CanonicalSource,
  EmitArtifact,
  EmitResult,
} from './types.js'
