import type { EntityManager } from "@mikro-orm/postgresql";

import { assertArtifactPathInRoot, resolveArtifactStoreRoot } from "@workflow-coordination/infrastructure/artifacts/storage.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import type {
  AppContext,
  GeneratedE2eRegressionRunner,
  GeneratedE2eRegressionRunOutput,
  RunGeneratedE2eRegressionTestsInput,
} from "@planning-review/domain/review-acceptance.ts";

interface GeneratedE2eArtifactRow {
  id: string;
  body_path: string | null;
}

interface GeneratedE2eRunnerPlan {
  runner: GeneratedE2eRegressionRunner;
  command: string[];
  cwd?: string;
  ciCommand: string[];
  ciEnv: Record<string, string>;
}

export async function runGeneratedE2eRegressionTests(
  em: EntityManager,
  ctx: AppContext,
  input: RunGeneratedE2eRegressionTestsInput,
): Promise<GeneratedE2eRegressionRunOutput> {
  const runner = input.runner ?? "bun";
  const rows = await loadGeneratedE2eArtifacts(em, ctx, input);
  if (rows.length === 0) {
    throw new AppNotFoundError("No accepted generated UAT E2E regression tests were found.");
  }

  const artifactRoot = resolveArtifactStoreRoot();
  const testFiles = rows.map((row) => {
    if (!row.body_path) {
      throw new AppValidationError(`Generated E2E artifact ${row.id} has no body_path.`);
    }
    return assertArtifactPathInRoot(artifactRoot, row.body_path);
  });
  const plan = buildGeneratedE2eRunnerPlan(runner, testFiles);
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  let status: GeneratedE2eRegressionRunOutput["status"] = "planned";
  if (!input.planOnly) {
    const proc = Bun.spawn(plan.command, { stdout: "pipe", stderr: "pipe", cwd: plan.cwd });
    [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    status = exitCode === 0 ? "passed" : "failed";
  }
  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId: input.projectId,
    actor: ctx.userId ?? "system",
    subjectKind: "project",
    subjectId: input.projectId,
    verb: "generated_e2e_regression_run_completed",
    payload: {
      traceId: input.traceId ?? null,
      runner,
      status,
      command: plan.command,
      cwd: plan.cwd ?? null,
      testFiles,
      artifactIds: rows.map((row) => row.id),
      exitCode,
      ciCommand: plan.ciCommand,
      ciEnv: plan.ciEnv,
    },
  });
  return {
    projectId: input.projectId,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    runner,
    status,
    command: plan.command,
    ...(plan.cwd ? { cwd: plan.cwd } : {}),
    testFiles,
    artifactIds: rows.map((row) => row.id),
    stdout,
    stderr,
    exitCode,
    ciCommand: plan.ciCommand,
    ciEnv: plan.ciEnv,
    eventId: event.id,
  };
}

export function buildGeneratedE2eRunnerPlan(
  runner: GeneratedE2eRegressionRunner,
  testFiles: string[],
): GeneratedE2eRunnerPlan {
  const ciCommand = ["bun", "run", "scripts/ci-generated-e2e.ts"];
  const ciEnv = {
    FULCRUM_GENERATED_E2E_RUNNER: runner,
    FULCRUM_GENERATED_E2E_FILES: testFiles.join(":"),
  };
  if (runner === "playwright") {
    return {
      runner,
      command: ["bun", "run", "web:e2e:generated", "--", ...testFiles],
      cwd: "apps/web",
      ciCommand,
      ciEnv,
    };
  }
  return {
    runner,
    command: ["bun", "test", ...testFiles],
    ciCommand,
    ciEnv,
  };
}

async function loadGeneratedE2eArtifacts(
  em: EntityManager,
  ctx: AppContext,
  input: RunGeneratedE2eRegressionTestsInput,
): Promise<GeneratedE2eArtifactRow[]> {
  const runner = input.runner ?? "bun";
  const params: string[] = [ctx.orgId, input.projectId];
  const traceFilter = input.traceId ? "and metadata_json->>'traceId' = ?" : "";
  if (input.traceId) params.push(input.traceId);
  const runnerFilter = runner === "bun"
    ? "and coalesce(metadata_json->>'runner', 'bun') = 'bun'"
    : "and metadata_json->>'runner' = 'playwright'";
  return await em.getConnection().execute<GeneratedE2eArtifactRow[]>(
    `select id, body_path
       from artifacts
      where org_id = ?
        and project_id = ?
        and metadata_json->>'generatedBy' = 'uat_code_review_approval'
        and metadata_json->>'lifecycleState' = 'accepted'
        ${runnerFilter}
        ${traceFilter}
      order by created_at asc, id asc`,
    params,
  );
}
