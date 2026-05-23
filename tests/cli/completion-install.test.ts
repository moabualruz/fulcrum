import { afterEach, describe, expect, test } from "bun:test";

import { run as runCompletion, COMPLETION_SHELLS } from "../../apps/cli/src/completion.ts";
import { run as runRoot } from "../../apps/cli/src/index.ts";
import { isCanonicalEnvelope } from "../../apps/cli/src/lib/envelope.ts";

/**
 * `fulcrum completion <shell>`: CLI completion install (`CLI-TUI-UX.md` §4).
 *
 * Covers the `prd-cli-completion-install` acceptance contract:
 *  - bash|zsh|fish|powershell each emit a shell-specific completion script;
 *  - an unsupported shell returns the canonical `fulcrum.cli.v1` JSON error and,
 *    in plain mode, the `COPY.md` §3 recovery block;
 *  - `--help` carries the §4 install examples;
 *  - the command preserves startup and the §3 JSON-envelope behaviour.
 */

const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

afterEach(() => {
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
  process.exitCode = 0;
});

async function captureCompletion(args: readonly string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}> {
  let stdout = "";
  let stderr = "";
  // `process.exitCode` is a real process global; another test file in the same
  // bun run may leave it set. Reset before the run so the value read after is
  // attributable to this command alone.
  process.exitCode = undefined;
  process.stdout.write = ((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  let exitCode: number | undefined;
  try {
    await runCompletion(args);
    // Snapshot immediately, before any await boundary lets another task run.
    exitCode = process.exitCode === 0 ? undefined : (process.exitCode as number | undefined);
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = 0;
  }
  return { stdout, stderr, exitCode };
}

// Shell-specific signature each completion script must contain.
const SHELL_SIGNATURE: Record<(typeof COMPLETION_SHELLS)[number], string> = {
  bash: "complete -F _fulcrum fulcrum",
  zsh: "#compdef fulcrum",
  fish: "complete -c fulcrum",
  powershell: "Register-ArgumentCompleter",
};

describe("fulcrum completion: shell-specific scripts", () => {
  for (const shell of COMPLETION_SHELLS) {
    test(`completion ${shell} emits a ${shell}-specific script with install guidance`, async () => {
      const { stdout, exitCode } = await captureCompletion([shell]);
      // Acceptance: shell-specific completion content.
      expect(stdout).toContain(SHELL_SIGNATURE[shell]);
      // Acceptance: CLI-TUI-UX.md §4 install-guidance header is printed.
      expect(stdout).toContain(`# Fulcrum ${shell} completion`);
      expect(stdout).toContain(`fulcrum completion ${shell}`);
      // Success: no error exit code (0 / undefined: bun may default it to 0).
      expect(exitCode ?? 0).toBe(0);
    });
  }

  test("completion zsh prints the §4 fpath install line", async () => {
    const { stdout } = await captureCompletion(["zsh"]);
    expect(stdout).toContain("source <(fulcrum completion zsh)");
    expect(stdout).toContain("/usr/local/share/zsh/site-functions/_fulcrum");
  });

  test("completion --shell zsh compatibility alias still resolves", async () => {
    const { stdout } = await captureCompletion(["--shell", "zsh"]);
    expect(stdout).toContain("#compdef fulcrum");
  });
});

describe("fulcrum completion --json envelope", () => {
  test("completion zsh --json emits the canonical fulcrum.cli.v1 envelope", async () => {
    const { stdout, exitCode } = await captureCompletion(["zsh", "--json"]);
    const envelope = JSON.parse(stdout.trim());
    // Acceptance: completion command preserves the §3 JSON envelope behaviour.
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.schema).toBe("fulcrum.cli.v1");
    expect(envelope.command).toBe("fulcrum completion");
    expect(envelope.errors).toEqual([]);
    expect(envelope.result.shell).toBe("zsh");
    expect(envelope.result.script).toContain("#compdef fulcrum");
    expect(Array.isArray(envelope.result.install)).toBe(true);
    // Success: no error exit code (0 / undefined: bun may default it to 0).
    expect(exitCode ?? 0).toBe(0);
  });
});

describe("fulcrum completion: unsupported shell", () => {
  test("unsupported shell --json returns the canonical fulcrum.cli.v1 error envelope", async () => {
    const { stdout, exitCode } = await captureCompletion(["powersh", "--json"]);
    const envelope = JSON.parse(stdout.trim());
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.result).toBeNull();
    expect(envelope.errors).toHaveLength(1);
    expect(envelope.errors[0].code).toBe("FUL_CLI_UNSUPPORTED_SHELL");
    expect(envelope.errors[0].message).toContain("powersh");
    expect(envelope.errors[0].fix).toBe("fulcrum completion zsh");
    expect(exitCode).toBe(2);
  });

  test("unsupported shell plain mode prints the recovery block to stderr", async () => {
    const { stdout, stderr, exitCode } = await captureCompletion(["powersh"]);
    expect(stdout).toBe("");
    // COPY.md §3 recovery block: message + Fix: + trace=<id>.
    expect(stderr).toContain('Unsupported shell "powersh"');
    expect(stderr).toContain("Fix: fulcrum completion zsh");
    expect(stderr).toMatch(/trace=/);
    expect(exitCode).toBe(2);
  });

  test("missing shell plain mode names the supported shells", async () => {
    const { stderr, exitCode } = await captureCompletion([]);
    expect(stderr).toContain("No shell given");
    expect(stderr).toContain("bash, zsh, fish, powershell");
    expect(exitCode).toBe(2);
  });
});

describe("fulcrum completion --help", () => {
  test("help text includes the §4 install examples", async () => {
    const { stdout } = await captureCompletion(["--help"]);
    expect(stdout).toContain("Install examples (CLI-TUI-UX.md §4)");
    expect(stdout).toContain("source <(fulcrum completion zsh)");
    expect(stdout).toContain("fulcrum completion zsh > /usr/local/share/zsh/site-functions/_fulcrum");
    expect(stdout).toContain("fulcrum completion fish > ~/.config/fish/completions/fulcrum.fish");
  });
});

describe("fulcrum completion: consumed-by the root dispatcher", () => {
  test("root `completion` command dispatches to the completion module", async () => {
    let stdout = "";
    const restore = process.stdout.write;
    process.stdout.write = ((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      await runRoot(["completion", "zsh"]);
    } finally {
      process.stdout.write = restore;
    }
    // The completion deliverable is consumed by `fulcrum completion` end-to-end,
    // not merely exported: the root dispatcher routes to it and prints a script.
    expect(stdout).toContain("# Fulcrum zsh completion");
    expect(stdout).toContain("#compdef fulcrum");
  });
});
