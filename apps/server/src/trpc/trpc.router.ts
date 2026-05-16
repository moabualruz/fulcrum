import "reflect-metadata";

import { Injectable, type INestApplication, type OnModuleInit } from "@nestjs/common";
import * as trpcExpress from "@trpc/server/adapters/express";

import { TrpcService } from "./trpc.service.ts";
import { createContext, type TrpcContext } from "./context.ts";

import { authRouter } from "./routers/auth.ts";
import { flagsRouter } from "./routers/flags.ts";
import { inferenceRouter } from "./routers/inference.ts";
import { orgsRouter } from "./routers/orgs.ts";
import { tasksRouter } from "./routers/tasks.ts";
import { sprintsRouter } from "./routers/sprints.ts";
import { memoryRouter } from "./routers/memory.ts";
import { docsRouter } from "./routers/docs.ts";
import { customFieldDefsRouter, taskCustomFieldsRouter } from "./routers/custom-fields.ts";
import { auditRouter } from "./routers/audit.ts";
import { backupRouter } from "./routers/backup.ts";
import { dataExportRouter, dataImportRouter } from "./routers/json-import-export.ts";
import { errorLogsRouter } from "./routers/error-logs.ts";
import { telemetryRouter } from "./routers/telemetry.ts";
import { themeRouter } from "./routers/theme.ts";
import { routingRouter } from "./routers/routing.ts";
import { skillsRouter } from "./routers/skills.ts";
import { orchestrationRouter } from "./routers/orchestration.ts";
import { notificationsRouter } from "./routers/notifications.ts";
import { artifactsRouter } from "./routers/artifacts.ts";
import { reposRouter } from "./routers/repos.ts";
import { credentialsRouter } from "./routers/credentials.ts";
import { reportsRouter } from "./routers/reports.ts";
import { webhooksRouter } from "./routers/webhooks.ts";
import { commentsRouter } from "./routers/comments.ts";
import { workflowsRouter } from "./routers/workflows.ts";
import { relationshipsRouter } from "./routers/relationships.ts";
import { templatesRouter } from "./routers/templates.ts";
import { recurrenceRouter } from "./routers/recurrence.ts";
import { automationsRouter } from "./routers/automations.ts";
import { planningRouter } from "./routers/planning.ts";
import {
  runsSubscriptionRouter,
  notifySubscriptionRouter,
  orchestrationSubscriptionRouter,
} from "./routers/subscriptions.ts";
import { projectsRouter } from "./routers/projects.ts";
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

import { z } from "zod";

@Injectable()
export class TrpcRouter implements OnModuleInit {
  private _appRouter!: ReturnType<typeof this.buildRouter>;

  constructor(private readonly trpcService: TrpcService) {}

  onModuleInit() {
    this._appRouter = this.buildRouter();
  }

  get appRouter() {
    return this._appRouter;
  }

  private buildRouter() {
    const { router, publicProcedure } = this.trpcService;

    const dbRouter = router({
      ping: publicProcedure
        .output(z.object({ ok: z.boolean() }))
        .query(() => ({ ok: true })),
    });

    const healthRouter = router({
      ping: publicProcedure
        .output(z.object({ ok: z.boolean(), timestamp: z.date() }))
        .query(() => ({ ok: true, timestamp: new Date() })),
    });

    return router({
      auth: authRouter,
      orgs: orgsRouter,
      flags: flagsRouter,
      projects: projectsRouter,
      tasks: tasksRouter,
      customFieldDefs: customFieldDefsRouter,
      taskCustomFields: taskCustomFieldsRouter,
      sprints: sprintsRouter,
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
      automations: automationsRouter,
      planning: planningRouter,
      credentials: credentialsRouter,
      db: dbRouter,
      health: healthRouter,
      runsSubscriptions: runsSubscriptionRouter,
      notifySubscriptions: notifySubscriptionRouter,
      orchestrationSubscriptions: orchestrationSubscriptionRouter,
    });
  }

  async applyMiddleware(app: INestApplication) {
    app.use(
      "/trpc",
      trpcExpress.createExpressMiddleware({
        router: this._appRouter,
        createContext: ({ req, res }) => {
          const locals = (req as Record<string, unknown>)["locals"] as
            | Record<string, unknown>
            | undefined;

          return createContext({
            session: (locals?.["session"] as TrpcContext["session"]) ?? null,
            orgId: (locals?.["orgId"] as string) ?? null,
            userId: (locals?.["userId"] as string) ?? null,
            em: (locals?.["em"] as TrpcContext["em"]) ?? null,
            container: (locals?.["container"] as TrpcContext["container"]) ?? null,
            legacyStore: locals?.["legacyStore"] as TrpcContext["legacyStore"],
            requestId: req.headers["x-request-id"] as string | undefined ?? null,
            responseHeaders: new Headers(),
          });
        },
      }),
    );
  }
}

export type AppRouter = ReturnType<TrpcRouter["buildRouter"]>;
