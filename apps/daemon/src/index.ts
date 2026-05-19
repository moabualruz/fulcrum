#!/usr/bin/env bun
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startFulcrumNestServer } from "@fulcrum/server/index.ts";
import { resolveEventTransport } from "@platform-core/application/event-bus/index.ts";

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? join(process.env["HOME"] ?? "", ".fulcrum");
}

async function writeDaemonFiles(home = fulcrumHome()): Promise<{ pidfile: string; socket: string }> {
  await mkdir(home, { recursive: true });
  const pidfile = join(home, "daemon.pid");
  const socket = join(home, "daemon.sock");
  await writeFile(pidfile, `${process.pid}\n`, "utf8");
  await writeFile(socket, "fulcrumd\n", "utf8");
  return { pidfile, socket };
}

async function cleanupDaemonFiles(files: { pidfile: string; socket: string }): Promise<void> {
  await Promise.all([
    rm(files.pidfile, { force: true }),
    rm(files.socket, { force: true }),
  ]);
}

export async function startFulcrumDaemon(): Promise<void> {
  const files = await writeDaemonFiles();
  const transport = resolveEventTransport();
  process.env["FULCRUM_EVENT_TRANSPORT"] = transport;
  const server = await startFulcrumNestServer();

  const shutdown = async () => {
    await server.close();
    await cleanupDaemonFiles(files);
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

if (import.meta.main) {
  await startFulcrumDaemon();
}

