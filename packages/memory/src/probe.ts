import { execFileSync } from "node:child_process";

export interface MemoryExecutableProbe {
  state: "managed" | "degraded";
  executable: string;
  version?: string;
  reason?: string;
}

export function probeMemoryExecutable(command: string, enabledEnv: string): MemoryExecutableProbe {
  if (process.env[enabledEnv] !== "1") {
    return {
      state: "degraded",
      executable: command,
      reason: `${command} backend not enabled`
    };
  }
  try {
    const version = execFileSync(command, ["--version"], {
      encoding: "utf8",
      timeout: 2500,
      stdio: ["ignore", "pipe", "ignore"]
    })
      .split(/\r?\n/)[0]
      ?.trim();
    return { state: "managed", executable: command, version };
  } catch {
    return {
      state: "degraded",
      executable: command,
      reason: `${command} executable unavailable`
    };
  }
}
