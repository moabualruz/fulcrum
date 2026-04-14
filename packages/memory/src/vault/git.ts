// packages/memory/src/vault/git.ts
import { simpleGit } from 'simple-git'

export interface VaultGit {
  isRepo(): Promise<boolean>
  init(): Promise<void>
  commitAll(message: string): Promise<void>
  createMemoryBranch(taskId: string): Promise<void>
  mergeMemoryBranch(taskId: string): Promise<void>
  getChangedFiles(from: string, to: string, pattern?: string): Promise<string[]>
  currentBranch(): Promise<string>
}

export function createVaultGit(vaultPath: string): VaultGit {
  const git = simpleGit(vaultPath)
  // Track the default branch name set during init()
  let _defaultBranch = 'main'

  return {
    async isRepo(): Promise<boolean> {
      try {
        await git.revparse(['--git-dir'])
        return true
      } catch {
        return false
      }
    },

    async init(): Promise<void> {
      try {
        // git >= 2.28 supports -b to set the initial branch name
        await git.raw(['init', '-b', 'main'])
      } catch {
        // Older git doesn't support -b; fall back and rename the default branch
        await git.init()
        // Point HEAD at refs/heads/main before any commit exists
        await git.raw(['symbolic-ref', 'HEAD', 'refs/heads/main'])
      }
      _defaultBranch = 'main'
      await git.raw(['config', 'user.email', 'vault@fulcrum.local'])
      await git.raw(['config', 'user.name', 'Fulcrum Vault'])
      // Create an initial empty commit so HEAD is valid and branches can be created
      await git.commit('init: fulcrum vault', { '--allow-empty': null })
    },

    async commitAll(message: string): Promise<void> {
      await git.add('.')
      await git.commit(message, { '--allow-empty': null })
    },

    async createMemoryBranch(taskId: string): Promise<void> {
      await git.checkoutLocalBranch(`memory/${taskId}`)
    },

    async mergeMemoryBranch(taskId: string): Promise<void> {
      const branch = `memory/${taskId}`
      // Return to default branch; use _defaultBranch set during init
      await git.checkout(_defaultBranch)
      // --no-ff ensures a merge commit is always created (preserves branch history)
      await git.merge([branch, '--no-ff', '-m', `merge: memory branch ${branch}`])
    },

    async getChangedFiles(from: string, to: string, pattern?: string): Promise<string[]> {
      const args = ['diff', '--name-only', from, to]
      if (pattern) args.push('--', pattern)
      const result = await git.raw(args)
      return result.split('\n').filter(Boolean)
    },

    async currentBranch(): Promise<string> {
      return (await git.revparse(['--abbrev-ref', 'HEAD'])).trim()
    },
  }
}
