// packages/memory/src/vault/git.ts
import simpleGit from 'simple-git'

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
      await git.init()
      await git.raw(['config', 'user.email', 'vault@fulcrum.local'])
      await git.raw(['config', 'user.name', 'Fulcrum Vault'])
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
      await git.checkout('main')
      await git.merge([branch])
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
