/**
 * Core AppRouter — root tRPC router for Fulcrum.
 *
 * P13.01 seals the additive router namespace for Web, CLI codegen, and TUI
 * callers. Domain-owning pillars replace stub bodies in their own slices.
 */

import { z } from "zod";

import { t, publicProcedure } from "./trpc.ts";
import { protectedProcedure } from "./middleware.ts";

import { authRouter } from "../server/trpc/routers/auth.ts";
import { flagsRouter } from "../server/trpc/routers/flags.ts";
import { inferenceRouter } from "../server/trpc/routers/inference.ts";
import { orgsRouter } from "../server/trpc/routers/orgs.ts";
import { tasksRouter } from "../server/trpc/routers/tasks.ts";
import { docsRouter } from "../server/trpc/routers/docs.ts";
import { customFieldDefsRouter, taskCustomFieldsRouter } from "../server/trpc/routers/custom-fields.ts";
import { auditRouter } from "../server/trpc/routers/audit.ts";
import { backupRouter } from "../server/trpc/routers/backup.ts";
import { orchestrationRouter } from "./routers/orchestration.ts";
import { notificationsRouter } from "./routers/notifications.ts";
import { artifactsRouter } from "./routers/artifacts.ts";
import { reposRouter } from "./routers/repos.ts";
import { credentialsRouter } from "../secrets/credentials-router.ts";
import { webhooksRouter } from "./routers/webhooks.ts";
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  SavedSearchCreateInputSchema,
  SavedSearchDeleteInputSchema,
  SavedSearchOutputSchema,
  SavedSearchUpdateInputSchema,
  updateSavedSearch,
} from "../search/saved-searches.ts";

const EmptyInputSchema = z.void();
const IdInputSchema = z.object({ id: z.string().min(1) });
const OptionalRecordInputSchema = z.record(z.string(), z.unknown()).optional();
const StubRowSchema = z.object({
  id: z.string(),
  orgId: z.string().nullable(),
});
const StubOperationOutputSchema = z.object({
  ok: z.literal(true),
  domain: z.string(),
  procedure: z.string(),
  requestId: z.string().nullable(),
});

function op(ctx: { requestId: string | null }, domain: string, procedure: string) {
  return {
    ok: true as const,
    domain,
    procedure,
    requestId: ctx.requestId,
  };
}

function listProcedure() {
  return protectedProcedure
    .input(EmptyInputSchema)
    .output(z.array(StubRowSchema))
    .query(() => []);
}

function getProcedure() {
  return protectedProcedure
    .input(IdInputSchema)
    .output(StubRowSchema.nullable())
    .query(() => null);
}

function mutationProcedure(domain: string, procedure: string) {
  return protectedProcedure
    .input(OptionalRecordInputSchema)
    .output(StubOperationOutputSchema)
    .mutation(({ ctx }) => op(ctx, domain, procedure));
}

function idMutationProcedure(domain: string, procedure: string) {
  return protectedProcedure
    .input(IdInputSchema)
    .output(StubOperationOutputSchema)
    .mutation(({ ctx }) => op(ctx, domain, procedure));
}

function crudProcedures(domain: string) {
  return {
    list: listProcedure(),
    get: getProcedure(),
    create: mutationProcedure(domain, "create"),
    update: mutationProcedure(domain, "update"),
    delete: idMutationProcedure(domain, "delete"),
  };
}

function crudRouter(domain: string) {
  return t.router(crudProcedures(domain));
}

const dbRouter = t.router({
  ping: publicProcedure
    .output(z.object({ ok: z.boolean() }))
    .query(() => ({ ok: true })),
});

const healthRouter = t.router({
  ping: publicProcedure
    .output(z.object({ ok: z.boolean(), timestamp: z.date() }))
    .query(() => ({ ok: true, timestamp: new Date() })),
});

const projectsRouter = t.router({
  ...crudProcedures("projects"),
  stats: protectedProcedure
    .input(IdInputSchema)
    .output(z.record(z.string(), z.number()))
    .query(() => ({})),
});

const sprintsRouter = t.router({
  ...crudProcedures("sprints"),
  activate: idMutationProcedure("sprints", "activate"),
  complete: idMutationProcedure("sprints", "complete"),
});

const customFieldsRouter = t.router({
  list: listProcedure(),
  create: mutationProcedure("custom_fields", "create"),
  update: mutationProcedure("custom_fields", "update"),
  delete: idMutationProcedure("custom_fields", "delete"),
  reorder: mutationProcedure("custom_fields", "reorder"),
});

const savedViewsRouter = crudRouter("saved_views");

const docVersionsRouter = t.router({
  list: listProcedure(),
  get: getProcedure(),
  restore: idMutationProcedure("doc_versions", "restore"),
});

const docCommentsRouter = t.router({
  list: listProcedure(),
  create: mutationProcedure("doc_comments", "create"),
  update: mutationProcedure("doc_comments", "update"),
  delete: idMutationProcedure("doc_comments", "delete"),
});

const docLinksRouter = t.router({
  list: listProcedure(),
  create: mutationProcedure("doc_links", "create"),
  delete: idMutationProcedure("doc_links", "delete"),
});

const memoriesRouter = t.router({
  ...crudProcedures("memories"),
  promote: idMutationProcedure("memories", "promote"),
});

const contextRouter = t.router({
  assemble: protectedProcedure
    .input(OptionalRecordInputSchema)
    .output(StubOperationOutputSchema)
    .query(({ ctx }) => op(ctx, "context", "assemble")),
  preview: protectedProcedure
    .input(OptionalRecordInputSchema)
    .output(StubOperationOutputSchema)
    .query(({ ctx }) => op(ctx, "context", "preview")),
});

const agentRunsRouter = t.router({
  list: listProcedure(),
  get: getProcedure(),
  create: mutationProcedure("agent_runs", "create"),
  cancel: idMutationProcedure("agent_runs", "cancel"),
  retry: idMutationProcedure("agent_runs", "retry"),
});

const repoBranchesRouter = t.router({
  list: listProcedure(),
  get: getProcedure(),
});

const repoCommitsRouter = t.router({
  list: listProcedure(),
  get: getProcedure(),
});

const searchRouter = t.router({
  query: protectedProcedure
    .input(z.object({ q: z.string().default("") }))
    .output(z.array(StubRowSchema))
    .query(() => []),
  suggest: protectedProcedure
    .input(z.object({ q: z.string().default("") }))
    .output(z.array(z.string()))
    .query(() => []),
  savedList: protectedProcedure
    .input(EmptyInputSchema)
    .output(z.array(SavedSearchOutputSchema))
    .query(({ ctx }) => listSavedSearches(ctx)),
  savedCreate: protectedProcedure
    .input(SavedSearchCreateInputSchema)
    .output(SavedSearchOutputSchema)
    .mutation(({ ctx, input }) => createSavedSearch(ctx, input)),
  savedUpdate: protectedProcedure
    .input(SavedSearchUpdateInputSchema)
    .output(SavedSearchOutputSchema)
    .mutation(({ ctx, input }) => updateSavedSearch(ctx, input)),
  savedDelete: protectedProcedure
    .input(SavedSearchDeleteInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(({ ctx, input }) => deleteSavedSearch(ctx, input)),
});

const routingRouter = t.router({
  ...crudProcedures("routing"),
  test: mutationProcedure("routing", "test"),
  dryRun: protectedProcedure
    .input(OptionalRecordInputSchema)
    .output(StubOperationOutputSchema)
    .query(({ ctx }) => op(ctx, "routing", "dryRun")),
});

const fulcrumSkillsRouter = t.router({
  list: listProcedure(),
  install: mutationProcedure("fulcrum_skills", "install"),
  upgrade: mutationProcedure("fulcrum_skills", "upgrade"),
  uninstall: idMutationProcedure("fulcrum_skills", "uninstall"),
  sync: mutationProcedure("fulcrum_skills", "sync"),
  resolveConflict: mutationProcedure("fulcrum_skills", "resolveConflict"),
});

// webhooksRouter imported from ./routers/webhooks.ts (Pillar 13, Issue 07).

const connectorsRouter = t.router({
  list: listProcedure(),
  get: getProcedure(),
  enable: mutationProcedure("connectors", "enable"),
  disable: idMutationProcedure("connectors", "disable"),
  sync: mutationProcedure("connectors", "sync"),
  runs: t.router({
    list: listProcedure(),
    get: getProcedure(),
  }),
});

const doctorRouter = t.router({
  run: protectedProcedure
    .input(EmptyInputSchema)
    .output(z.object({
      ok: z.boolean(),
      subsystem: z.literal("api"),
      requestId: z.string(),
    }))
    .query(({ ctx }) => ({
      ok: true,
      subsystem: "api" as const,
      requestId: ctx.requestId ?? "",
    })),
  subsystems: protectedProcedure
    .input(EmptyInputSchema)
    .output(z.array(z.string()))
    .query(() => ["api"]),
});

const invitationsRouter = t.router({
  list: listProcedure(),
  get: getProcedure(),
  create: mutationProcedure("invitations", "create"),
  revoke: idMutationProcedure("invitations", "revoke"),
});

export const appRouter = t.router({
  auth: authRouter,
  orgs: orgsRouter,
  flags: flagsRouter,
  projects: projectsRouter,
  tasks: tasksRouter,
  customFieldDefs: customFieldDefsRouter,
  taskCustomFields: taskCustomFieldsRouter,
  sprints: sprintsRouter,
  custom_fields: customFieldsRouter,
  saved_views: savedViewsRouter,
  docs: docsRouter,
  doc_versions: docVersionsRouter,
  doc_comments: docCommentsRouter,
  doc_links: docLinksRouter,
  memories: memoriesRouter,
  context: contextRouter,
  agent_runs: agentRunsRouter,
  artifacts: artifactsRouter,
  repos: reposRouter,
  repo_branches: repoBranchesRouter,
  repo_commits: repoCommitsRouter,
  search: searchRouter,
  notify: notificationsRouter,
  audit: auditRouter,
  backup: backupRouter,
  routing: routingRouter,
  fulcrum_skills: fulcrumSkillsRouter,
  orchestration: orchestrationRouter,
  inference: inferenceRouter,
  webhooks: webhooksRouter,
  connectors: connectorsRouter,
  doctor: doctorRouter,
  invitations: invitationsRouter,
  credentials: credentialsRouter,

  db: dbRouter,
  health: healthRouter,

  // Backward-compatible aliases for pre-P13 root names.
  memory: memoriesRouter,
  runs: agentRunsRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
