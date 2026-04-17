// `fulcrum daemon <subcommand>` dispatch.
//
// indexer   → start the long-lived indexer daemon (blocks; exits on SIGTERM)
// sockname  → print the resolved socket path; with --ensure, also spawn the
//             daemon if it's not already running.
//
// See docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md Unit 1.5.

export async function runDaemon(args: string[]): Promise<void> {
  const sub = args[0]

  if (!sub || sub === '--help' || sub === '-h') {
    printUsage()
    process.exit(sub ? 0 : 1)
  }

  if (sub === 'indexer') {
    const { runDaemonMain } = await import('fulcrum-memory')
    await runDaemonMain()
    return
  }

  if (sub === 'sockname') {
    const ensure = args.includes('--ensure')
    const { indexerSocketPath, createIndexerClient } = await import('fulcrum-memory')
    const path = indexerSocketPath()
    if (ensure) {
      const client = createIndexerClient()
      try { await client.ping() } finally { client.close() }
    }
    console.log(path)
    return
  }

  console.error(`Unknown daemon subcommand: ${sub}`)
  printUsage()
  process.exit(1)
}

function printUsage(): void {
  console.error(`Usage:
  fulcrum daemon indexer                    Run the indexer daemon (blocks).
  fulcrum daemon sockname [--ensure]        Print the indexer socket path.
                                            With --ensure, also spawns the
                                            daemon when it is not already
                                            running.`)
}
