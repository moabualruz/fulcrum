import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InferenceLifecycle } from "./lifecycle.ts";

let scratch = "";
let lifecycle: InferenceLifecycle | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-inference-lifecycle-"));
});

afterEach(async () => {
  await lifecycle?.stop();
  lifecycle = undefined;
  await rm(scratch, { recursive: true, force: true });
});

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeMockServer(): Promise<{ path: string; logPath: string }> {
  const path = join(scratch, "mock-inference-server.ts");
  const logPath = join(scratch, "spawn.log");
  await Bun.write(path, `#!/usr/bin/env bun
import net from "node:net";
import { appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const home = process.env.FULCRUM_HOME;
if (!home) throw new Error("FULCRUM_HOME required");
const socketPath = join(home, "inference.sock");
appendFileSync(${JSON.stringify(logPath)}, "spawn\\n");
rmSync(socketPath, { force: true });

function frame(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const out = Buffer.alloc(body.byteLength + 4);
  out.writeUInt32BE(body.byteLength, 0);
  body.copy(out, 4);
  return out;
}

const server = net.createServer((socket) => {
  let buf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.byteLength >= 4) {
      const len = buf.readUInt32BE(0);
      if (buf.byteLength < len + 4) return;
      const request = JSON.parse(buf.subarray(4, 4 + len).toString("utf8"));
      buf = buf.subarray(4 + len);
      socket.write(frame({
        jsonrpc: "2.0",
        id: request.id,
        result: { status: "ok", backends: ["mock"], models: [] },
      }));
    }
  });
});

server.listen(socketPath);
process.on("SIGTERM", () => {
  server.close(() => {
    rmSync(socketPath, { force: true });
    process.exit(0);
  });
});
setInterval(() => {}, 1000);
`);
  await chmod(path, 0o755);
  return { path, logPath };
}

describe("InferenceLifecycle", () => {
  test("ensureRunning spawns once and returns cached PID within 1 second", async () => {
    const { path, logPath } = await writeMockServer();
    lifecycle = new InferenceLifecycle({
      homeDir: join(scratch, ".fulcrum"),
      serverPath: path,
      readinessIntervalMs: 20,
      readinessTimeoutMs: 1000,
    });

    const first = await lifecycle.ensureRunning();
    const second = await lifecycle.ensureRunning();

    expect(second).toEqual(first);
    expect(await readFile(logPath, "utf8")).toBe("spawn\n");
    expect(await exists(first.socketPath)).toBe(true);
  });

  test("stop sends SIGTERM and removes socket plus PID file", async () => {
    const { path } = await writeMockServer();
    lifecycle = new InferenceLifecycle({
      homeDir: join(scratch, ".fulcrum"),
      serverPath: path,
      readinessIntervalMs: 20,
      readinessTimeoutMs: 1000,
    });
    const running = await lifecycle.ensureRunning();

    const stopped = await lifecycle.stop();

    expect(stopped.pid).toBe(running.pid);
    expect(stopped.socketRemoved).toBe(true);
    expect(stopped.pidFileRemoved).toBe(true);
    expect(await exists(running.socketPath)).toBe(false);
  });
});
