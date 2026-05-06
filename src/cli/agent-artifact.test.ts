import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { run as runAgent } from "./agent.ts";
import { run as runArtifact } from "./artifact.ts";
import { run as runArtifacts, type ArtifactsClient } from "./artifacts.ts";

let scratch = "";
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-agent-artifact-cli-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return { lines, restore: () => { console.log = original; } };
}

describe("fulcrum agent/artifact CLI", () => {
  test("agent run --task <id> --json creates queued run", async () => {
    const taskId = "task-agent-cli";

    const cap = captureStdout();
    try {
      await runAgent(["run", "--task", taskId, "--agent", "codex", "--json"], {
        caller: {
          orchestration: {
            dispatchRun: async (input) => ({
              runId: "run-agent-cli",
              state: "unclaimed",
              agent: input.agentName,
            }),
          },
        },
      });
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.task_id).toBe(taskId);
    expect(payload.agent).toBe("codex");
    expect(payload.status).toBe("queued");
  });

  test("artifact list --json returns caller-backed artifact rows", async () => {
    const output: string[] = [];
    await runArtifact(["list", "--json"], {
      caller: {
        artifacts: {
          list: async () => [{ id: "artifact-1", filename: "artifact.txt", preview: "cli artifact" }],
          get: async () => null,
        },
      },
      print: (line) => output.push(line),
      printErr: () => {},
      exit: () => {},
    });
    const payload = JSON.parse(output.join("\n"));
    expect(payload).toHaveLength(1);
    expect(payload[0].id).toBe("artifact-1");
    expect(payload[0].preview).toBe("cli artifact");
  });

  test("artifact delete --hard requires explicit confirmation path", async () => {
    const calls: Array<{ id: string; hard: boolean; confirm?: boolean }> = [];
    const client = {
      delete: async (input: { id: string; hard: boolean; confirm?: boolean }) => {
        calls.push(input);
        return { ok: true, id: input.id };
      },
    } as unknown as ArtifactsClient;

    await runArtifacts(["delete", "artifact-1", "--hard", "--json"], client);

    expect(calls[0]).toEqual({ id: "artifact-1", hard: true, confirm: true });
  });
});
