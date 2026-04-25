import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type SupervisedProcessTerminalStatus = "completed" | "failed" | "cancelled";

export interface SupervisedProcessOutput {
  stream: "stdout" | "stderr";
  line: string;
}

export interface SupervisedProcessOutcome {
  status: SupervisedProcessTerminalStatus;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  summary: string;
  cancelReason?: string;
  startedAt: string;
  endedAt: string;
  transcript: string[];
}

export interface SupervisedProcessOptions {
  env?: NodeJS.ProcessEnv;
  killTimeoutMs?: number;
  onOutput?: (output: SupervisedProcessOutput) => void;
  onOutcome?: (outcome: SupervisedProcessOutcome) => void | Promise<void>;
}

export interface SupervisedProcess {
  process: ChildProcessWithoutNullStreams;
  cancel: (reason?: string) => boolean;
  done: Promise<SupervisedProcessOutcome>;
  transcript: () => string[];
}

export function startSupervisedProcess(
  command: string,
  args: string[],
  cwd: string,
  options: SupervisedProcessOptions = {}
): SupervisedProcess {
  const startedAt = new Date().toISOString();
  const transcript: string[] = [];
  const child = spawn(command, args, { cwd, env: options.env, stdio: "pipe" });
  let cancelReason: string | undefined;
  let settled = false;
  let killTimer: NodeJS.Timeout | undefined;
  let resolveDone: (outcome: SupervisedProcessOutcome) => void;
  let rejectDone: (error: unknown) => void;
  const done = new Promise<SupervisedProcessOutcome>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const appendOutput = (stream: "stdout" | "stderr", chunk: Buffer): void => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      if (!line) {
        continue;
      }
      transcript.push(`${stream}: ${line}`);
      options.onOutput?.({ stream, line });
    }
  };

  const settle = (
    outcome: Omit<SupervisedProcessOutcome, "startedAt" | "endedAt" | "transcript">
  ): void => {
    if (settled) {
      return;
    }
    settled = true;
    if (killTimer) {
      clearTimeout(killTimer);
    }
    const terminalOutcome: SupervisedProcessOutcome = {
      ...outcome,
      startedAt,
      endedAt: new Date().toISOString(),
      transcript: [...transcript]
    };
    Promise.resolve(options.onOutcome?.(terminalOutcome))
      .then(() => resolveDone(terminalOutcome))
      .catch((error: unknown) => rejectDone(error));
  };

  child.stdout.on("data", (chunk: Buffer) => appendOutput("stdout", chunk));
  child.stderr.on("data", (chunk: Buffer) => appendOutput("stderr", chunk));
  child.on("error", (error) => {
    settle({
      status: "failed",
      exitCode: null,
      signal: null,
      summary: `process failed to start: ${error.message}`,
      cancelReason
    });
  });
  child.on("close", (exitCode, signal) => {
    const status: SupervisedProcessTerminalStatus = cancelReason
      ? "cancelled"
      : exitCode === 0
        ? "completed"
        : "failed";
    const summary =
      status === "completed"
        ? "process exited 0"
        : signal
          ? `process exited by signal ${signal}`
          : `process exited ${exitCode ?? "unknown"}`;
    settle({
      status,
      exitCode,
      signal,
      summary,
      cancelReason
    });
  });

  return {
    process: child,
    cancel: (reason = "operator requested cancellation") => {
      if (settled || child.exitCode !== null) {
        return false;
      }
      cancelReason = reason;
      child.kill("SIGTERM");
      const killTimeoutMs = options.killTimeoutMs ?? 5_000;
      if (killTimeoutMs > 0) {
        killTimer = setTimeout(() => {
          if (!settled && child.exitCode === null) {
            child.kill("SIGKILL");
          }
        }, killTimeoutMs);
      }
      return true;
    },
    done,
    transcript: () => [...transcript]
  };
}
