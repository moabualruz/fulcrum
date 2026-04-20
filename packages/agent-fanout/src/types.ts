export type AgentTarget =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'opencode'
  | 'pi'
  | 'copilot'
  | 'cursor'
  | 'windsurf'

export const ALL_TARGETS: readonly AgentTarget[] = [
  'claude',
  'codex',
  'gemini',
  'opencode',
  'pi',
  'copilot',
  'cursor',
  'windsurf',
] as const

export interface CanonicalSkill {
  name: string
  path: string
  frontmatter: Record<string, unknown>
  body: string
  raw: string
}

export interface CanonicalSource {
  skills: CanonicalSkill[]
}

export interface EmitArtifact {
  path: string
  contents: string
  sourceSkillName?: string
}

export interface EmitResult {
  target: AgentTarget
  artifacts: EmitArtifact[]
}
