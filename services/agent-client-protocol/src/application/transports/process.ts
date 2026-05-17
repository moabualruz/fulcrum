import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";

import { TransportListeners, type AcpTransport, type Unsubscribe } from "@agent-client-protocol/application/transports/types.ts";

export interface ProcessTransportOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export class ProcessTransport implements AcpTransport {
  private readonly messageListeners = new TransportListeners<string>();
  private readonly closeListeners = new TransportListeners<string | undefined>();
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private closed = false;

  private constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.handleStdout(String(chunk)));
    child.stderr.on("data", (chunk) => this.handleStderr(String(chunk)));
    child.on("error", (error) => this.handleClose(`process error: ${error.message}`));
    child.on("close", (code, signal) => {
      const stderr = this.stderrBuffer.trim();
      const suffix = stderr ? `; stderr: ${stderr}` : "";
      this.handleClose(`process exited (code=${code ?? "unknown"}, signal=${signal ?? "none"})${suffix}`);
    });
  }

  static start(options: ProcessTransportOptions): ProcessTransport {
    if (!options.command) throw new Error("ProcessTransport requires a command");
    const spawnOptions: SpawnOptionsWithoutStdio = {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: "pipe",
    };
    return new ProcessTransport(spawn(options.command, options.args ?? [], spawnOptions));
  }

  async send(json: string): Promise<void> {
    if (this.closed) throw new Error("ProcessTransport is closed");
    const payload = json.endsWith("\n") ? json : `${json}\n`;
    await new Promise<void>((resolve, reject) => {
      this.child.stdin.write(payload, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  onMessage(cb: (json: string) => void): Unsubscribe {
    return this.messageListeners.add(cb);
  }

  onClose(cb: (reason?: string) => void): Unsubscribe {
    return this.closeListeners.add(cb);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    try {
      this.child.stdin.end();
    } catch {
      /* ignore */
    }
    if (!this.child.killed) {
      this.child.kill();
    }
    queueMicrotask(() => this.handleClose("closed by client"));
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) this.messageListeners.emit(trimmed);
    }
  }

  private handleStderr(chunk: string): void {
    this.stderrBuffer = `${this.stderrBuffer}${chunk}`;
    if (this.stderrBuffer.length > 4_000) {
      this.stderrBuffer = this.stderrBuffer.slice(-4_000);
    }
  }

  private handleClose(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.closeListeners.emit(reason);
    this.messageListeners.clear();
    this.closeListeners.clear();
  }
}
