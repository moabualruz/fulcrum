// packages/memory/src/setup/wizard.ts
import { createInterface } from 'readline'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { readRawConfig, writeRawConfig } from 'fulcrum-core'
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
    // API key handling: if the relevant env var is already set, store "env" as the sentinel
    // value instead of the raw key. At runtime, "env" means "read from environment variable".
    // If the user typed a key interactively and the env var is not set, we store it as-is
    // but warn them to prefer an environment variable.
    let storedApiKey: string | undefined = embeddingSetup.apiKey
    const envVarName = embeddingSetup.provider === 'openai' ? 'OPENAI_API_KEY' : 'EMBEDDING_API_KEY'
    if (process.env[envVarName]) {
      storedApiKey = 'env'
    } else if (storedApiKey) {
      console.warn(`\n  ⚠ Deprecation: storing API key in config file. Set ${envVarName} as an environment variable instead.\n`)
    }
    const config = readRawConfig()
    config['vault'] = { path: vaultPath, l2_enabled: true }
    config['embedding'] = {
      provider: embeddingSetup.provider,
      url: embeddingSetup.url,
      model: embeddingSetup.model,
      apiKey: storedApiKey,
    }
    writeRawConfig(config)

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
