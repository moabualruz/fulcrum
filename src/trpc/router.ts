/**
 * Core AppRouter — root tRPC router for Fulcrum.
 *
 * Declarative mount-only: each domain router lives in its own file.
 * No inline stub helpers or duplicate aliases.
 */

import { z } from "zod";

import { t, publicProcedure } from "./trpc.ts";

import { authRouter } from "../server/trpc/routers/auth.ts";
import { flagsRouter } from "../server/trpc/routers/flags.ts";
import { inferenceRouter } from "../server/trpc/routers/inference.ts";
import { orgsRouter } from "../server/trpc/routers/orgs.ts";
import { tasksRouter } from "../server/trpc/routers/tasks.ts";
import { sprintsRouter } from "../server/trpc/routers/sprints.ts";
import { memoryRouter } from "../server/trpc/routers/memory.ts";
import { docsRouter } from "../server/trpc/routers/docs.ts";
import { customFieldDefsRouter, taskCustomFieldsRouter } from "../server/trpc/routers/custom-fields.ts";
import { auditRouter } from "../server/trpc/routers/audit.ts";
import { backupRouter } from "../server/trpc/routers/backup.ts";
import { dataExportRouter, dataImportRouter } from "../server/trpc/routers/json-import-export.ts";
import { errorLogsRouter } from "../server/trpc/routers/error-logs.ts";
import { telemetryRouter } from "../server/trpc/routers/telemetry.ts";
import { themeRouter } from "../server/trpc/routers/theme.ts";
import { routingRouter } from "../server/trpc/routers/routing.ts";
import { skillsRouter } from "../server/trpc/routers/skills.ts";
import { orchestrationRouter } from "./routers/orchestration.ts";
import { notificationsRouter } from "./routers/notifications.ts";
import { artifactsRouter } from "./routers/artifacts.ts";
import { reposRouter } from "./routers/repos.ts";
import { credentialsRouter } from "../secrets/credentials-router.ts";
import { reportsRouter } from "./routers/reports.ts";
import { webhooksRouter } from "./routers/webhooks.ts";
import { commentsRouter } from "../server/trpc/routers/comments.ts";
import { workflowsRouter } from "../server/trpc/routers/workflows.ts";
import { relationshipsRouter } from "../server/trpc/routers/relationships.ts";
import { templatesRouter } from "../server/trpc/routers/templates.ts";
import { recurrenceRouter } from "../server/trpc/routers/recurrence.ts";
import {
  runsSubscriptionRouter,
  notifySubscriptionRouter,
  orchestrationSubscriptionRouter,
} from "../subscriptions/procedures.ts";

// Extracted stub routers (formerly inline)
import { projectsRouter } from "./routers/projects.ts";
import { customFieldsRouter } from "./routers/custom-fields.ts";
import { savedViewsRouter } from "./routers/saved-views.ts";
import { docVersionsRouter } from "./routers/doc-versions.ts";
import { docCommentsRouter } from "./routers/doc-comments.ts";
import { docLinksRouter } from "./routers/doc-links.ts";
import { contextRouter } from "./routers/context.ts";
import { agentRunsRouter } from "./routers/agent-runs.ts";
import { agentsRouter } from "./routers/agents.ts";
import { repoBranchesRouter } from "./routers/repo-branches.ts";
import { repoCommitsRouter } from "./routers/repo-commits.ts";
import { searchRouter } from "./routers/search.ts";
import { connectorsRouter } from "./routers/connectors.ts";
import { doctorRouter } from "./routers/doctor.ts";
import { invitationsRouter } from "./routers/invitations.ts";

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
  memories: memoryRouter,
  context: contextRouter,
  agents: agentsRouter,
  agent_runs: agentRunsRouter,
  artifacts: artifactsRouter,
  repos: reposRouter,
  repo_branches: repoBranchesRouter,
  repo_commits: repoCommitsRouter,
  search: searchRouter,
  notify: notificationsRouter,
  audit: auditRouter,
  backup: backupRouter,
  dataExport: dataExportRouter,
  dataImport: dataImportRouter,
  errorLogs: errorLogsRouter,
  telemetry: telemetryRouter,
  theme: themeRouter,
  routing: routingRouter,
  fulcrum_skills: skillsRouter,
  orchestration: orchestrationRouter,
  inference: inferenceRouter,
  webhooks: webhooksRouter,
  connectors: connectorsRouter,
  doctor: doctorRouter,
  invitations: invitationsRouter,
  reports: reportsRouter,
  comments: commentsRouter,
  workflows: workflowsRouter,
  relationships: relationshipsRouter,
  templates: templatesRouter,
  recurrence: recurrenceRouter,
  credentials: credentialsRouter,

  db: dbRouter,
  health: healthRouter,

  // P13#02: WebSocket subscription routers.
  runsSubscriptions: runsSubscriptionRouter,
  notifySubscriptions: notifySubscriptionRouter,
  orchestrationSubscriptions: orchestrationSubscriptionRouter,
});

export type AppRouter = typeof appRouter;
