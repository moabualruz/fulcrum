// packages/cli/src/tui/index.ts
// Cockpit TUI entry point — invoked as `fulcrum tui`

import { render } from 'ink'
import React from 'react'
import App from './App.js'

export async function runTui(): Promise<void> {
  const { waitUntilExit } = render(React.createElement(App))
  await waitUntilExit()
}
