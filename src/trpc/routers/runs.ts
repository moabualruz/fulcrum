/**
 * Runs sub-router — agent run queries including transcript log streaming.
 *
 * list() returns [] until Pillar 5 wires ctx.container → RunRepository.
 * getLogs reads JSONL transcript file and returns paginated lines (P4#11).
 *
 * C8: needle-di Container pattern; repo resolved from ctx.container when available.
 */

import { z } from "zod/v4";
import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import { readTranscriptLines } from "../../orchestration/transcript-diff.ts";

const TranscriptLineSchema = z.object({
  ts: z.string(),
  stream: z.enum(["stdout", "stderr"]),
  text: z.string(),
});

export const runsRouter = t.router({
  /** list — stub; Pillar 5 replaces with: await repo.find({ org: ctx.orgId }) */
  list: permissionedProcedure({ resource: "runs", action: "list" }).query(() => []),

  /** getLogs — read JSONL transcript, paginated */
  getLogs: permissionedProcedure({ resource: "runs", action: "getLogs" })
    .input(
      z.object({
        transcriptPath: z.string(),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      }),
    )
    .output(
      z.object({
        lines: z.array(z.union([TranscriptLineSchema, z.record(z.string(), z.unknown())])),
        total: z.number(),
        truncated: z.boolean(),
      }),
    )
    .query(async ({ input }) => {
      return readTranscriptLines(
        input.transcriptPath,
        input.offset ?? 0,
        input.limit ?? 100,
      );
    }),
});

export type RunsRouter = typeof runsRouter;
