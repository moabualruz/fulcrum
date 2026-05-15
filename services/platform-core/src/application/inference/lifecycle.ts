import { Injectable } from "@nestjs/common";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import net from "node:net";

import {
  HealthResultSchema,
  InferenceResponseSchema,
  encodeJsonRpcFrame,
} from "./protocol.ts";
import { getRoutingConfig } from "./routing-config.ts";

export interface InferenceRunning {
  pid: number;
  socketPath: string;
}

export interface InferenceCacheStats {
  db_path: string;
  embed_rows: number;
  gen_rows: number;
}

export interface InferenceStatus {
  status: "ok" | "down";
  pid?: number;
  socketPath: string;
  cache?: InferenceCacheStats;
}

export interface InferenceStopResult {
  status: "stopped" | "not-running";
  pid?: number;
  socketPath: string;
  socketRemoved: boolean;
  pidFileRemoved: boolean;
}

export interface InferenceLifecycleOptions {
  homeDir?: string;
  socketPath?: string;
  pidFilePath?: string;
  serverPath?: string;
  readinessIntervalMs?: number;
  readinessTimeoutMs?: number;
  healthTimeoutMs?: number;
}

const DEFAULT_READINESS_INTERVAL_MS = 100;
const DEFAULT_READINESS_TIMEOUT_MS = 10_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 500;
const CACHE_TTL_MS = 1_000;

function defaultHomeDir(): string {
  return process.env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPid(path: string): Promise<number | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    const pid = Number(raw.trim());
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

function defaultServerPath(): string {
  if (process.env["FULCRUM_INFERENCE_SERVER"]) return process.env["FULCRUM_INFERENCE_SERVER"];
  const root = process.cwd();
  const candidates = [
    join(root, "services", "inference-runtime", "target", "release", "inference-server"),
    join(root, "services", "inference-runtime", "target", "debug", "inference-server"),
  ];
  return candidates.find((path) => existsSync(path)) ?? candidates[0]!;
}

async function probeHealth(socketPath: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let buffer = Buffer.alloc(0);
    const socket = net.createConnection({ path: socketPath });
    const request = {
      jsonrpc: "2.0" as const,
      id: "health-probe",
      method: "health",
      params: {},
    };

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once("connect", () => {
      socket.write(Buffer.from(encodeJsonRpcFrame(request)));
    });
    socket.once("error", () => finish(false));
    socket.on("data", (chunk) => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      buffer = Buffer.concat([buffer, bytes]);
      if (buffer.byteLength < 4) return;
      const length = buffer.readUInt32BE(0);
      if (buffer.byteLength < length + 4) return;
      try {
        const body = buffer.subarray(4, 4 + length).toString("utf8");
        const response = InferenceResponseSchema.parse(JSON.parse(body));
        finish(Boolean(response.result && HealthResultSchema.safeParse(response.result).success));
      } catch {
        finish(false);
      }
    });
  });
}

export class InferenceLifecycle {
  private readonly homeDir: string;
  private readonly pidFilePath: string;
  private readonly serverPath: string;
  private readonly readinessIntervalMs: number;
  private readonly readinessTimeoutMs: number;
  private readonly healthTimeoutMs: number;
  readonly socketPath: string;
  private cache?: InferenceRunning & { cachedAt: number };

  constructor(options: InferenceLifecycleOptions = {}) {
    this.homeDir = options.homeDir ?? defaultHomeDir();
    this.socketPath = options.socketPath ?? join(this.homeDir, "inference.sock");
    this.pidFilePath = options.pidFilePath ?? join(this.homeDir, "inference.pid");
    this.serverPath = options.serverPath ?? defaultServerPath();
    this.readinessIntervalMs = options.readinessIntervalMs ?? DEFAULT_READINESS_INTERVAL_MS;
    this.readinessTimeoutMs = options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
    this.healthTimeoutMs = options.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  }

  async ensureRunning(): Promise<InferenceRunning> {
    if (this.cache && Date.now() - this.cache.cachedAt < CACHE_TTL_MS) {
      return { pid: this.cache.pid, socketPath: this.cache.socketPath };
    }

    await mkdir(this.homeDir, { recursive: true });

    const existingPid = await readPid(this.pidFilePath);
    if (
      existingPid &&
      isProcessAlive(existingPid) &&
      await probeHealth(this.socketPath, this.healthTimeoutMs)
    ) {
      return this.remember({ pid: existingPid, socketPath: this.socketPath });
    }

    await rm(this.pidFilePath, { force: true });
    await rm(this.socketPath, { force: true });

    if (!(await exists(this.serverPath))) {
      throw new Error(`inference-server binary not found: ${this.serverPath}`);
    }

    const proc = Bun.spawn([this.serverPath, "--socket"], {
      cwd: process.cwd(),
      env: { ...process.env, FULCRUM_HOME: this.homeDir },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.unref();
    const pid = proc.pid;
    await writeFile(this.pidFilePath, `${pid}\n`, "utf8");

    const deadline = Date.now() + this.readinessTimeoutMs;
    while (Date.now() < deadline) {
      if (await probeHealth(this.socketPath, this.healthTimeoutMs)) {
        return this.remember({ pid, socketPath: this.socketPath });
      }
      const exitCode = await Promise.race([
        proc.exited,
        sleep(0).then(() => undefined),
      ]);
      if (exitCode !== undefined) {
        await rm(this.pidFilePath, { force: true });
        throw new Error(`inference-server exited before readiness (code ${exitCode})`);
      }
      await sleep(this.readinessIntervalMs);
    }

    proc.kill("SIGTERM");
    await rm(this.pidFilePath, { force: true });
    throw new Error(`inference-server did not become ready within ${this.readinessTimeoutMs}ms`);
  }

  async status(): Promise<InferenceStatus> {
    const pid = await readPid(this.pidFilePath);
    if (
      pid &&
      isProcessAlive(pid) &&
      await probeHealth(this.socketPath, this.healthTimeoutMs)
    ) {
      return { status: "ok", pid, socketPath: this.socketPath };
    }
    return { status: "down", pid, socketPath: this.socketPath };
  }

  async stop(): Promise<InferenceStopResult> {
    const pid = await readPid(this.pidFilePath);
    if (pid && isProcessAlive(pid)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Process already gone; cleanup below still owns stale files.
      }
    }

    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline && await exists(this.socketPath)) {
      await sleep(50);
    }

    await rm(this.socketPath, { force: true });
    await rm(this.pidFilePath, { force: true });
    this.cache = undefined;

    return {
      status: pid ? "stopped" : "not-running",
      pid,
      socketPath: this.socketPath,
      socketRemoved: !(await exists(this.socketPath)),
      pidFileRemoved: !(await exists(this.pidFilePath)),
    };
  }

  private remember(running: InferenceRunning): InferenceRunning {
    this.cache = { ...running, cachedAt: Date.now() };
    return running;
  }
}

Injectable()(InferenceLifecycle);

const defaultLifecycle = new InferenceLifecycle();

export function ensureRunning(): Promise<InferenceRunning> {
  return defaultLifecycle.ensureRunning();
}

/**
 * Ensure the embedded sidecar is running, but only if the routing config
 * selects "embedded" for embeddings or router-llm. External backends are
 * probed only; never auto-spawned.
 */
export async function ensureRunningIfEmbedded(): Promise<InferenceRunning | null> {
  const config = getRoutingConfig();
  const embedBackend = config["embeddings"];
  const llmBackend = config["router-llm"];
  const needsEmbedded = embedBackend === "embedded" || llmBackend === "embedded";

  if (needsEmbedded) {
    return defaultLifecycle.ensureRunning();
  }
  return null;
}

export function status(): Promise<InferenceStatus> {
  return defaultLifecycle.status();
}

export function stop(): Promise<InferenceStopResult> {
  return defaultLifecycle.stop();
}
