/** Agents router — real profile management logic. */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { EntityManager } from "typeorm";

import { t } from "../trpc.ts";
import { publicProcedure } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import { getProfile, listProfiles } from "@execution-orchestration/application/agent-catalog/registry.ts";
import { AgentProfileSchema } from "@execution-orchestration/application/agent-catalog/types.ts";
import {
  getProfile as getStoredAgentProfile,
  testProfileAction,
} from "@execution-orchestration/application/agents/queries.ts";

// ─── SEC-02: CLI binary allowlist ────────────────────────────────────────────
// Only binaries registered in the agent profile registry may be spawned.
// This prevents arbitrary command execution via DB-stored cliPath values.

// In test/dev, FULCRUM_AGENT_CLI_ALLOWLIST (comma-separated) extends the list.

function getAllowedCliPaths(): Set<string> {
  const registered = listProfiles().map((p) => p.cliPath);
  const envExtras = (process.env["FULCRUM_AGENT_CLI_ALLOWLIST"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...registered, ...envExtras]);
}

function assertCliPathAllowed(cliPath: string): void {
  const allowed = getAllowedCliPaths();
  // Allow exact match OR basename match (e.g. "/usr/bin/claude" matches "claude").
  const basename = cliPath.split("/").pop() ?? cliPath;
  if (!allowed.has(cliPath) && !allowed.has(basename)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `CLI path '${cliPath}' is not in the allowed agent binary list. Allowed: ${[...allowed].join(", ")}`,
    });
  }
}

function requireEntityManager(ctx: Record<string, unknown>): EntityManager {
  const manager = ctx["em"] as EntityManager | null | undefined;
  if (manager) return manager;
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "EntityManager required for agents.testProfile.",
  });
}

export const agentsRouter = t.router({
  listProfiles: publicProcedure
    .output(z.array(AgentProfileSchema))
    .query(() => listProfiles()),
  getProfile: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .output(AgentProfileSchema)
    .query(({ input }) => getProfile(input.name)),
  testProfile: permissionedProcedure({ resource: "agents", action: "testProfile" })
    .input(z.object({ name: z.string().min(1) }))
    .output(z.object({
      name: z.string(),
      testPassed: z.boolean(),
      lastTestedAt: z.date(),
      exitCode: z.number().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const manager = requireEntityManager(ctx);
      const profile = await getStoredAgentProfile(manager, ctx.orgId, input.name);

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Agent profile '${input.name}' not found.`,
        });
      }

      const cliPath = profile.cli_path ?? input.name;

      // SEC-02: Validate cliPath against allowlist before spawning.
      assertCliPathAllowed(cliPath);

      const proc = Bun.spawn([cliPath, "--version"], {
        stdout: "ignore",
        stderr: "ignore",
      });
      const exitCode = await proc.exited;
      const testPassed = exitCode === 0;
      const lastTestedAt = new Date();

      await testProfileAction(manager, profile.id, ctx.orgId, testPassed);

      return {
        name: profile.name,
        testPassed,
        lastTestedAt,
        exitCode,
      };
    }),
});
