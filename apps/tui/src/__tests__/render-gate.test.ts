import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const REPO_ROOT = new URL("../../../../", import.meta.url);

describe("Surface OpenTUI gate", () => {
  test("package.json pins the approved OpenTUI packages", async () => {
    const pkg = JSON.parse(await readFile(new URL("package.json", REPO_ROOT), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(pkg.dependencies?.["@opentui/core"]).toBe("0.2.2");
    expect(pkg.dependencies?.["@opentui/solid"]).toBe("0.2.2");
  });

  test("fulcrum tui keeps a non-interactive no-tui path", async () => {
    const proc = Bun.spawn(["bun", "run", "apps/cli/src/main.ts", "tui", "--no-tui"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: REPO_ROOT.pathname,
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("TUI mode disabled via --no-tui flag.");
  });
});
