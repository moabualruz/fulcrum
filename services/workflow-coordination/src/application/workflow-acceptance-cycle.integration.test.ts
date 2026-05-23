import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { MODULE_METADATA } from "@nestjs/common/constants";

import {
  FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
  FulcrumRunEventEntity,
} from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import { FULCRUM_JOB_QUEUE_ENTITIES } from "@platform-core/infrastructure/database/job-queue.entities.ts";
import { JobQueue1778751000000 } from "@platform-core/infrastructure/database/job-queue.migration.ts";
import {
  FULCRUM_REVIEW_WORKFLOW_ENTITIES,
  FulcrumGeneratedE2ETestEntity,
  FulcrumUatSessionEntity,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import { RunContext1778623200005 } from "@execution-orchestration/infrastructure/database/run-context.migration.ts";
import { ReviewWorkflow1778623200002 } from "@planning-review/infrastructure/database/review-workflow.migration.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumAcpSessionEntity,
  FulcrumAgentRunEntity,
  FulcrumDocumentEntity,
  FulcrumTaskEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { WorkflowAcceptanceCycleService } from "@workflow-coordination/application/workflow-acceptance-cycle.ts";
import { WorkflowCycleModule } from "@workflow-coordination/interface/http/workflow-cycle.module.ts";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;

async function startPgliteSocket(): Promise<string> {
  pglite = await PGlite.create();
  await pglite.waitReady;

  socketServer = new PGLiteSocketServer({
    db: pglite,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await socketServer.start();

  const [host, port] = socketServer.getServerConn().split(":");
  return `postgresql://postgres:postgres@${host}:${port}/postgres`;
}

afterEach(async () => {
  if (socketServer) {
    await socketServer.stop();
    socketServer = undefined;
  }
  if (pglite) {
    await pglite.close();
    pglite = undefined;
  }
});

describe("Workflow acceptance cycle service", () => {
  test("is available through the workflow Nest module", () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, WorkflowCycleModule) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, WorkflowCycleModule) as unknown[];

    expect(providers).toContain(WorkflowAcceptanceCycleService);
    expect(exports).toContain(WorkflowAcceptanceCycleService);
  });

  test("runs the freeform to generated-E2E workflow through service-owned TypeORM state", async () => {
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url: await startPgliteSocket(),
        entities: [
          ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
          ...FULCRUM_REVIEW_WORKFLOW_ENTITIES,
          ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
          ...FULCRUM_JOB_QUEUE_ENTITIES,
        ],
        migrations: [
          WorkflowSpine1778623200001,
          ReviewWorkflow1778623200002,
          RunContext1778623200005,
          JobQueue1778751000000,
        ],
      }),
    );

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();

      const cycle = new WorkflowAcceptanceCycleService(dataSource);
      const result = await cycle.runCycle({
        workspace: {
          id: "workspace-acceptance-cycle",
          slug: "acceptance-cycle",
          name: "Acceptance Cycle",
        },
        project: {
          id: "project-acceptance-cycle",
          slug: "acceptance-cycle",
          name: "Acceptance Cycle Project",
          traceId: "trace-acceptance-cycle",
        },
        freeform: {
          documentId: "doc-acceptance-cycle",
          title: "Build the copied workflow replacement",
          bodyMd: "Start from freeform docs, use guided planning, prototype the plan, execute dependencies, run QA, prompt UAT, and generate real data E2E coverage.",
          userPrompt: "Turn this into a technical plan with prototype and task success criteria.",
        },
        guidedPlanning: {
          acpSessionId: "acp-acceptance-cycle",
          agentName: "codex",
          cwd: "/Users/mkh/workspace/fulcrum",
          modeId: "planning",
          modelId: "gpt-5.4",
          permissionMode: "review_each_tool",
        },
        approvedPlan: {
          planId: "plan-acceptance-cycle",
          reviewId: "review-acceptance-cycle",
          markdown: [
            "# Copied Workflow Replacement",
            "",
            "## Tasks",
            "- [context] Preserve freeform context",
            "  Depends on: none",
            "- [planning] Build prototype-first planning flow",
            "  Depends on: context",
            "- [execution] Execute dependency-aware task run",
            "  Depends on: planning",
            "",
            "## Prototype / Boilerplate",
            "- [prototype] apps/web/src/routes/planning/+page.svelte",
            "",
            "## Success Criteria",
            "- Freeform docs feed guided planning.",
            "- Dependency disclosure happens before execution.",
            "- UAT approval generates real-data E2E coverage.",
          ].join("\n"),
        },
        execution: {
          agent: "codex",
          model: "gpt-5.4",
          prompt: "Run the dependency tree and report success criteria.",
          lifecycleSummary: "Task completed with accepted workflow evidence.",
          qaReviewText: [
            "## QA Review",
            "### Verdict: APPROVE",
            "Success criteria satisfied and no feedback remains.",
          ].join("\n"),
        },
        uat: {
          decision: "approve_without_manual_review",
          reviewType: "uat",
          e2eRunner: "bun",
        },
      });

      expect(result.traceId).toBe("trace-acceptance-cycle");
      expect(result.freeform.status).toBe("ready_for_planning");
      expect(result.guidedPlanning.status).toBe("ready_for_acp_prompt");
      expect(result.materializedTaskIds).toContain("task-plan-acceptance-cycle-verify-end-to-end");
      expect(result.dependencyRun.scheduledRuns.map((run) => run.status)).toEqual([
        "queued",
        "queued",
        "queued",
        "queued",
      ]);
      expect(result.lifecycleEvents.map((event) => event.run.status)).toEqual([
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
      ]);
      expect(result.qaReviews.every((review) => review.verdict === "APPROVE")).toBe(true);
      expect(result.finalQa.status).toBe("passed");
      expect(result.handoff.status).toBe("ready");
      expect(result.uatDecision.status).toBe("approved");
      expect(result.generatedE2e.status).toBe("planned");
      expect(result.generatedE2e.testFiles.length).toBeGreaterThan(0);

      const docs = await dataSource.getRepository(FulcrumDocumentEntity).find({
        where: { projectId: "project-acceptance-cycle" },
        order: { id: "ASC" },
      });
      expect(docs.map((doc) => doc.sourceType).sort()).toEqual([
        "approved_plan",
        "freeform_work_intake",
        "prototype_artifact",
        "success_criteria",
      ]);

      await expect(dataSource.getRepository(FulcrumAcpSessionEntity).findOneByOrFail({
        id: "acp-acceptance-cycle",
      })).resolves.toMatchObject({
        projectId: "project-acceptance-cycle",
        traceId: "trace-acceptance-cycle",
        status: "ready_for_acp_prompt",
      });

      const tasks = await dataSource.getRepository(FulcrumTaskEntity).find({
        where: { projectId: "project-acceptance-cycle" },
        order: { id: "ASC" },
      });
      expect(tasks.map((task) => [task.id, task.status])).toEqual([
        ["task-plan-acceptance-cycle-context", "in-review"],
        ["task-plan-acceptance-cycle-execution", "in-review"],
        ["task-plan-acceptance-cycle-planning", "in-review"],
        ["task-plan-acceptance-cycle-verify-end-to-end", "in-review"],
        // generated-e2e mirror tasks the acceptance cycle now emits for each plan task
        ["task-trace-acceptance-cycle-generated-e2e-task-plan-acceptance-cycle-context", "todo"],
        ["task-trace-acceptance-cycle-generated-e2e-task-plan-acceptance-cycle-execution", "todo"],
        ["task-trace-acceptance-cycle-generated-e2e-task-plan-acceptance-cycle-planning", "todo"],
        ["task-trace-acceptance-cycle-generated-e2e-task-plan-acceptance-cycle-verify-end-to-end", "todo"],
      ]);

      const runs = await dataSource.getRepository(FulcrumAgentRunEntity).find({
        where: { projectId: "project-acceptance-cycle" },
        order: { id: "ASC" },
      });
      expect(runs.map((run) => run.status)).toEqual([
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
        "planned",
      ]);

      await expect(dataSource.getRepository(FulcrumUatSessionEntity).findOneByOrFail({
        id: "uat-trace-acceptance-cycle",
      })).resolves.toMatchObject({
        projectId: "project-acceptance-cycle",
        traceId: "trace-acceptance-cycle",
        status: "approved",
      });

      const generatedRows = await dataSource.getRepository(FulcrumGeneratedE2ETestEntity).find({
        where: { projectId: "project-acceptance-cycle", traceId: "trace-acceptance-cycle" },
      });
      expect(generatedRows.length).toBe(4);
      expect(generatedRows.every((row) => row.status === "accepted")).toBe(true);

      const events = await dataSource.getRepository(FulcrumRunEventEntity).find({
        where: { projectId: "project-acceptance-cycle", traceId: "trace-acceptance-cycle" },
      });
      expect(events.map((event) => event.mutationType)).toEqual(expect.arrayContaining([
        "dependency_tree_dispatched",
        "dependency_run_completed",
        "qa_review_recorded",
        "final_qa_completed",
        "uat_code_review_prompted",
        "uat_code_review_decision_recorded",
        "generated_e2e_regression_run_completed",
      ]));
    } finally {
      await dataSource.destroy();
    }
  });
});
