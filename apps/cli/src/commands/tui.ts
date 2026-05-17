/**
 * fulcrum tui — TUI subcommand handler.
 *
 * Launches the interactive terminal UI. Exits cleanly on 'q' or Ctrl+C.
 *
 * Usage:
 *   fulcrum tui
 *   fulcrum tui --help
 *
 * Options:
 *   --help       Show this help.
 *   --no-tui     Flag respected by convention; suppresses TUI mode (no-op here,
 *                for use by other commands to detect if TUI is disabled).
 *
 * Design: thin wrapper — builds the TUI caller, wires real stdin, and delegates
 * to TuiApp. Separated from TuiApp so tests can import TuiApp directly without
 * triggering real stdin/stdout setup.
 */

const HELP = `fulcrum tui

Launch the interactive terminal UI.

Usage:
  fulcrum tui [options]

Options:
  --help     Show this help.
  --no-tui   Disable TUI mode (suppresses interactive session).

Screens:
  Settings › Auth           — user email, org, passkeys
  Settings › Feature Flags  — toggle all registered feature flags

Keyboard:
  j/k or ↑/↓   navigate
  Enter/Space   open selected
  q             quit
`;

export interface TuiRunOptions {
  /** Process exit shim (default: process.exit). */
  exit?: (code: number) => void;

  /** stdout writer for messages before TUI starts (default: console.log). */
  print?: (line: string) => void;

}

export async function run(argv: readonly string[], opts: TuiRunOptions = {}): Promise<void> {
  const { exit = process.exit, print = console.log } = opts;

  if (argv.includes("--help") || argv.includes("-h")) {
    print(HELP);
    return;
  }

  if (argv.includes("--no-tui")) {
    print("TUI mode disabled via --no-tui flag.");
    return;
  }

  const { TuiApp, buildCaller, buildTelemetrySink } = await import("@fulcrum/tui/index.ts");

  // Check if we have a real TTY — if not (e.g. piped in CI), bail gracefully
  const isTTY = process.stdout.isTTY && process.stdin.isTTY;

  if (!isTTY) {
    print("fulcrum tui: no interactive terminal detected (stdout/stdin not a TTY).");
    print("TUI requires an interactive terminal. Run without pipe redirection.");
    return;
  }

  const [caller, telemetry] = await Promise.all([
    buildCaller(),
    buildTelemetrySink(),
  ]);

  // Wire real stdin for keypress events
  // We implement a minimal raw-mode stdin adapter here
  const { StdinInput } = await import("@fulcrum/tui/stdin-input.ts");
  const stdinInput = new StdinInput();

  const app = new TuiApp({
    caller,
    telemetry,
    input: stdinInput,
    onExit: () => {
      stdinInput.cleanup();
      exit(0);
    },
  });

  // Handle Ctrl+C
  process.once("SIGINT", () => {
    stdinInput.cleanup();
    app.stop();
    exit(0);
  });

  await app.mount();

  // Keep the process alive while the TUI is running
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (!app.isRunning) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });
}
