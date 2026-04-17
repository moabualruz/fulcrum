// Helper subprocess: starts a fulcrum-indexer daemon on the socket path given
// as argv[2], then exits when the server closes. Used by client-autospawn.test.ts
// to stand in for the real `fulcrum daemon indexer` binary without depending on
// a compiled CLI being on PATH during unit tests.

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const socketPath = process.argv[2]
if (!socketPath) {
  process.stderr.write('spawn-daemon-stub: missing socket path arg\n')
  process.exit(2)
}

const here = dirname(fileURLToPath(import.meta.url))
const daemonModule = resolve(here, '..', '..', 'daemon.ts')

const { startDaemon } = await import(daemonModule)
const handle = await startDaemon({ socketPath })
await new Promise((resolve) => handle.server.on('close', resolve))
process.exit(0)
