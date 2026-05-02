import { describe, expect, test } from "bun:test";

import { run } from "./inference.ts";
import type { HealthResult } from "../inference/protocol.ts";

const health: HealthResult = { status: "ok", backends: ["embedded"], models: [] };
const cache = {
  db_path: "/tmp/fulcrum/inference-cache.db",
  embed_rows: 2,
  gen_rows: 1,
};

function capture() {
  const lines: string[] = [];
  const errors: string[] = [];
  let exitCode: number | undefined;
  return {
    lines,
    errors,
    get exitCode() {
      return exitCode;
    },
    opts: {
      print: (line: string) => lines.push(line),
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => {
        exitCode = code;
      },
    },
  };
}

describe("fulcrum inference CLI", () => {
  test("start --json emits parseable JSON with PID, socket path, and health", async () => {
    const cap = capture();

    await run(["start", "--json"], {
      ...cap.opts,
      lifecycle: {
        ensureRunning: async () => ({ pid: 42, socketPath: "/tmp/fulcrum/inference.sock" }),
      },
      client: {
        call: async () => health,
      },
    });

    expect(cap.exitCode).toBeUndefined();
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload).toMatchObject({
      status: "ok",
      pid: 42,
      socketPath: "/tmp/fulcrum/inference.sock",
      health,
    });
  });

  test("status --json emits parseable JSON after health round-trip", async () => {
    const cap = capture();

    await run(["status", "--json"], {
      ...cap.opts,
      lifecycle: {
        status: async () => ({
          status: "ok",
          pid: 42,
          socketPath: "/tmp/fulcrum/inference.sock",
          cache,
        }),
      },
      client: {
        call: async () => health,
      },
    });

    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.status).toBe("ok");
    expect(payload.health.status).toBe("ok");
    expect(payload.cache).toEqual(cache);
  });

  test("stop confirms socket removal", async () => {
    const cap = capture();

    await run(["stop"], {
      ...cap.opts,
      lifecycle: {
        stop: async () => ({
          status: "stopped",
          pid: 42,
          socketPath: "/tmp/fulcrum/inference.sock",
          socketRemoved: true,
          pidFileRemoved: true,
        }),
      },
    });

    expect(cap.exitCode).toBeUndefined();
    expect(cap.lines.join("\n")).toContain("socket removed");
  });
});
