/** Agents router — real profile management logic. */

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { t } from "../trpc.ts";
import { publicProcedure } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";
import { getProfile, listProfiles } from "../../agents/registry.ts";
import { AgentProfileSchema } from "../../agents/types.ts";
import { AgentProfile as AgentProfileEntity } from "../../db/entities/sandbox/AgentProfile.ts";

export const agentsRouter = t.router({
  listProfiles: publicProcedure
    .output(z.array(AgentProfileSchema))
    .query(() => listProfiles()),
  getProfile: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .output(AgentProfileSchema)
    .query(({ input }) => getProfile(input.name)),
  testProfile: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .output(z.object({
      name: z.string(),
      testPassed: z.boolean(),
      lastTestedAt: z.date(),
      exitCode: z.number().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.em) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "EntityManager required for agents.testProfile.",
        });
      }

      const agentProfileRepo = ctx.em.getRepository(AgentProfileEntity);
      const profile = await agentProfileRepo.findOne({
        org: ctx.orgId,
        name: input.name,
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Agent profile '${input.name}' not found.`,
        });
      }

      const cliPath = profile.cliPath ?? input.name;
      const proc = Bun.spawn([cliPath, "--version"], {
        stdout: "ignore",
        stderr: "ignore",
      });
      const exitCode = await proc.exited;
      const testPassed = exitCode === 0;
      const lastTestedAt = new Date();

      agentProfileRepo.assign(profile, { lastTestedAt, testPassed });
      await ctx.em.flush();

      return {
        name: profile.name,
        testPassed,
        lastTestedAt,
        exitCode,
      };
    }),
});
