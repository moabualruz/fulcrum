import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { inject, injectable as Injectable } from "@needle-di/core";

import {
  ContextAssembler,
  type ContextAssembleOptions,
  type ContextBundle,
} from "../../context/assemble.ts";

export const DEFAULT_CONTEXT_BUNDLE_WORKSPACE_PATH = ".fulcrum/context.json";
export const CONTEXT_BUNDLE_PATH_ENV = "FULCRUM_CONTEXT_BUNDLE_PATH";

export interface BeforeRunContextHookCtx {
  workspacePath: string;
  logger?: {
    warn(message: string): void;
  };
}

export type BeforeRunContextHookBundle = ContextBundle | {
  taskId: string;
  slices: [];
  tokenCount: 0;
  error: string;
};

interface ContextAssemblerPort {
  assemble(
    taskId: string,
    opts?: ContextAssembleOptions,
  ): Promise<{ bundle: ContextBundle; snapshotId: string }>;
}

@Injectable()
export class BeforeRunContextHook {
  constructor(
    private readonly assembler: ContextAssemblerPort = inject(ContextAssembler),
  ) {}

  async handle(
    runId: string,
    taskId: string,
    agentType: string,
    ctx: BeforeRunContextHookCtx,
  ): Promise<BeforeRunContextHookBundle> {
    let bundle: BeforeRunContextHookBundle;

    try {
      const assembled = await this.assembler.assemble(taskId, {
        agentType,
        runId,
      });
      bundle = assembled.bundle;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger?.warn(
        `before_run context assembly failed for run ${runId}: ${message}`,
      );
      bundle = {
        taskId,
        slices: [],
        tokenCount: 0,
        error: message,
      };
    }

    await writeContextBundle(ctx.workspacePath, bundle);
    return bundle;
  }
}

async function writeContextBundle(
  workspacePath: string,
  bundle: BeforeRunContextHookBundle,
): Promise<void> {
  const targetPath = contextBundlePath(workspacePath);
  const payload = `${JSON.stringify(bundle, null, 2)}\n`;
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, payload, "utf8");
}

function contextBundlePath(workspacePath: string): string {
  const configuredPath = process.env[CONTEXT_BUNDLE_PATH_ENV] ??
    DEFAULT_CONTEXT_BUNDLE_WORKSPACE_PATH;
  return isAbsolute(configuredPath)
    ? configuredPath
    : join(workspacePath, configuredPath);
}
