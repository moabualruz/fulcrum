import { mkdir, appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface TuiCrashLogContext {
  screenKey: string;
  route?: string;
}

export interface TuiCrashLog {
  write(error: unknown, context: TuiCrashLogContext): Promise<void>;
}

export class JsonlCrashLog implements TuiCrashLog {
  private readonly rootDir: string;

  constructor(opts: { rootDir?: string } = {}) {
    this.rootDir = opts.rootDir ??
      process.env["FULCRUM_HOME"] ??
      join(homedir(), ".fulcrum", "state");
  }

  async write(error: unknown, context: TuiCrashLogContext): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    const dir = join(this.rootDir, "errors");
    await mkdir(dir, { recursive: true });

    const err = error instanceof Error ? error : new Error(String(error));
    const row = {
      occurred_at: new Date().toISOString(),
      surface: "tui",
      screen_key: context.screenKey,
      route: context.route ?? null,
      error_message: err.message,
      stack_trace: err.stack ?? null,
    };

    await appendFile(join(dir, `${date}.jsonl`), JSON.stringify(row) + "\n", "utf8");
  }
}
