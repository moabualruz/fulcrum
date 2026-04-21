import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  installCopilot,
  installCursor,
  installWindsurf,
} from '../../../../agent-integration/install.js'
import {
  emitCopilot,
  emitCursor,
  emitWindsurf,
  parseCanonicalSource,
} from '../../../../packages/agent-fanout/src/index.js'
import type { EmitArtifact } from '../../../../packages/agent-fanout/src/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..', '..')
const agentIntegrationRoot = join(repoRoot, 'agent-integration')
const installSourcePath = join(agentIntegrationRoot, 'install.ts')

function expectedArtifacts(target: 'cursor' | 'windsurf' | 'copilot'): EmitArtifact[] {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = target === 'cursor'
    ? emitCursor(source)
    : target === 'windsurf'
      ? emitWindsurf(source)
      : emitCopilot(source)
  return result.artifacts.filter((artifact) => artifact.sourceSkillName || artifact.sourceRuleName)
}

function assertInstalledFanoutArtifacts(tmpDir: string, artifacts: EmitArtifact[]): void {
  for (const artifact of artifacts.slice(0, 6)) {
    expect(readFileSync(join(tmpDir, artifact.path), 'utf8')).toBe(artifact.contents)
  }
}

describe('installer fanout utilization', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-fanout-install-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('installCursor consumes emitCursor output for generated rules', async () => {
    await installCursor({ dryRun: false, targetDir: tmpDir })

    assertInstalledFanoutArtifacts(tmpDir, expectedArtifacts('cursor'))
    expect(readFileSync(installSourcePath, 'utf8')).toContain('emitCursor')
  })

  it('installWindsurf consumes emitWindsurf output for generated rules', async () => {
    await installWindsurf({ dryRun: false, targetDir: tmpDir })

    assertInstalledFanoutArtifacts(tmpDir, expectedArtifacts('windsurf'))
    expect(readFileSync(installSourcePath, 'utf8')).toContain('emitWindsurf')
  })

  it('installCopilot consumes emitCopilot output for generated instructions', async () => {
    await installCopilot({ dryRun: false, targetDir: tmpDir })

    assertInstalledFanoutArtifacts(tmpDir, expectedArtifacts('copilot'))
    expect(readFileSync(installSourcePath, 'utf8')).toContain('emitCopilot')
  })
})
