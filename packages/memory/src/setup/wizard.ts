// packages/memory/src/setup/wizard.ts
import { createInterface } from 'readline'
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { getVaultPath, initVault } from '../vault/client.js'
import { createVaultGit } from '../vault/git.js'
import { rebuildFromVault } from './rebuild.js'
import { KuzuClient, setKuzuClient } from '../kuzu/client.js'

interface EmbeddingProviderSetup {
  provider: 'ollama' | 'openai' | 'custom'
  url?: string
  model?: string
  apiKey?: string
}

async function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise(resolve => {
    if ((rl as unknown as { closed: boolean }).closed) { resolve(''); return }
    rl.once('close', () => resolve(''))
    rl.question(question, answer => {
      rl.removeAllListeners('close')
      resolve(answer)
    })
  })
}

function getFulcrumConfigPath(): string {
  return join(homedir(), '.fulcrum', 'config.json')
}

function readFulcrumConfig(): Record<string, unknown> {
  const configPath = getFulcrumConfigPath()
  if (!existsSync(configPath)) return {}
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeFulcrumConfig(config: Record<string, unknown>): void {
  const configPath = getFulcrumConfigPath()
  mkdirSync(join(homedir(), '.fulcrum'), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

async function setupEmbeddingProvider(rl: ReturnType<typeof createInterface>): Promise<EmbeddingProviderSetup | null> {
  console.log('\n  Requires an embedding model:\n')
  console.log('    [1] Local — Ollama (no cost, runs on device)')
  console.log('    [2] OpenAI text-embedding-3-small (API key)')
  console.log('    [3] Custom OpenAI-compatible endpoint')
  console.log('    [4] Skip — stay with L0 + L1\n')

  const choice = (await ask(rl, '  Choice: ')).trim()

  if (choice === '4' || choice === '') return null

  if (choice === '1') {
    const url = (await ask(rl, `  Ollama URL [http://localhost:11434]: `)).trim() || 'http://localhost:11434'
    const model = (await ask(rl, `  Ollama model [nomic-embed-text]: `)).trim() || 'nomic-embed-text'
    return { provider: 'ollama', url, model }
  }

  if (choice === '2') {
    const apiKey = (await ask(rl, '  OpenAI API key: ')).trim()
    return { provider: 'openai', apiKey, model: 'text-embedding-3-small' }
  }

  if (choice === '3') {
    const url = (await ask(rl, '  Endpoint URL: ')).trim()
    const model = (await ask(rl, '  Model name: ')).trim()
    const apiKey = (await ask(rl, '  API key (leave blank if none): ')).trim() || undefined
    return { provider: 'custom', url, model, apiKey }
  }

  return null
}

export async function runMemoryInit(options?: { vaultPath?: string }): Promise<void> {
  const vaultPath = options?.vaultPath ?? getVaultPath()
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  try {
    // Step 1: Initialize L0 vault
    await initVault(vaultPath)

    // Step 2: Initialize git
    const git = createVaultGit(vaultPath)
    const isRepo = await git.isRepo()
    if (!isRepo) {
      await git.init()
      await git.commitAll('init: fulcrum vault')
    }

    console.log(`\n  ✓ L0 vault initialised at ${vaultPath}`)
    console.log('  ✓ Git repository initialised')
    console.log('  ✓ L1 SQLite ready (FTS5 full-text search active)\n')
    console.log('  Default memory is ready. You have:')
    console.log('  • File-based vault with git versioning')
    console.log('  • Full-text keyword search (FTS5)')
    console.log(`  • Human-readable memories in ${vaultPath}\n`)
    console.log('  ─────────────────────────────────────────────────')
    console.log('  Enable memory acceleration? (L2)\n')
    console.log('  Adds semantic vector search and cross-project')
    console.log('  knowledge graph. Example: a bad Rust pattern')
    console.log('  found in project A surfaces automatically')
    console.log('  when starting project B.\n')

    const embeddingSetup = await setupEmbeddingProvider(rl)

    if (!embeddingSetup) {
      console.log('\n  Staying with L0 + L1. Run `fulcrum memory accelerate` later to enable L2.\n')
      return
    }

    // Step 3: Write embedding config to ~/.fulcrum/config.json
    const config = readFulcrumConfig()
    config['vault'] = { path: vaultPath, l2_enabled: true }
    config['embedding'] = {
      provider: embeddingSetup.provider,
      url: embeddingSetup.url,
      model: embeddingSetup.model,
      apiKey: embeddingSetup.apiKey,
    }
    writeFulcrumConfig(config)

    // Step 4: Initialize Kuzu
    const kuzuDbPath = join(homedir(), '.fulcrum', 'kuzu')
    mkdirSync(kuzuDbPath, { recursive: true })
    const kuzuClient = await KuzuClient.create({ dbPath: kuzuDbPath })
    setKuzuClient(kuzuClient)

    console.log('\n  Indexing existing memories into L2...')
    const result = await rebuildFromVault({ vaultPath, target: 'l2' })
    console.log(`  ✓ L2 indexed ${result.l2Count} memories`)
    if (result.errors.length > 0) {
      console.log(`  ⚠ ${result.errors.length} errors (see log.md)`)
    }
    console.log('\n  L2 acceleration active.\n')
  } finally {
    rl.close()
  }
}
