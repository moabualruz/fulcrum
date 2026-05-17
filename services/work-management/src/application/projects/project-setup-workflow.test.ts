import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import {
  createProject,
  createProjectFromSetup,
  createProjectTask,
  deleteProject,
  deleteProjectTask,
  rescheduleProjectTask,
  updateProject,
  updateProjectTask,
} from "@work-management/application/projects/commands.ts";
import {
  getProjectHierarchy,
  getProjectOrNull,
  listProjectActivityEvents,
  listProjectBoardTasks,
  listProjectOptions,
  listProjectRows,
  loadProjectCalendar,
  loadProjectGantt,
  loadProjectOverview,
  resolveProjectIdByKey,
} from "@work-management/application/projects/queries.ts";
import {
  AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID,
  loadTemplateSource,
  normalizeTemplate,
  previewTemplateEffects,
} from "@work-management/application/templates/engine.ts";
import { evaluateTemplateTrustPolicy } from "@work-management/application/project-policy/trust.ts";

const ctx = { orgId: DEFAULT_ORG_ID, userId: "user-workflow", projectId: null };

describe("Workflow project hierarchy and setup", () => {
  test("project read model SQL uses TypeORM-compatible bind placeholders", async () => {
    const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

    expect(source).not.toContain("WHERE org_id = ?");
    expect(source).not.toContain("WHERE id = ? AND org_id = ?");
  });

  test("supports workspace/project/subproject/deep child hierarchy and aggregate dashboard scope", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const workspace = await createProject(em, ctx, {
        slug: "workspace",
        name: "Workspace",
        kind: "workspace",
      });
      const project = await createProject(em, ctx, {
        slug: "project",
        name: "Project",
        kind: "project",
        parentId: workspace.id,
      });
      const subproject = await createProject(em, ctx, {
        slug: "subproject",
        name: "Subproject",
        kind: "subproject",
        parentId: project.id,
      });
      const leaf = await createProject(em, ctx, {
        slug: "leaf",
        name: "Leaf",
        kind: "subproject",
        parentId: subproject.id,
      });

      await em.getConnection().execute(
        `INSERT INTO tasks (id, org_id, project_id, title, status)
         VALUES (?, ?, ?, 'Parent task', 'pending'),
                (?, ?, ?, 'Leaf task', 'in_progress')`,
        [crypto.randomUUID(), ctx.orgId, project.id, crypto.randomUUID(), ctx.orgId, leaf.id],
      );

      await expect(getProjectHierarchy(em, ctx, workspace.id)).resolves.toMatchObject({
        project: { id: workspace.id, kind: "workspace", path: "workspace", depth: 0 },
        descendants: [
          { id: project.id, parentId: workspace.id, depth: 1, path: "workspace/project" },
          { id: subproject.id, parentId: project.id, depth: 2, path: "workspace/project/subproject" },
          { id: leaf.id, parentId: subproject.id, depth: 3, path: "workspace/project/subproject/leaf" },
        ],
      });
      await expect(loadProjectOverview(em, { ...ctx, projectId: workspace.id }, workspace.id, { includeDescendants: true }))
        .resolves.toMatchObject({ summary: { openTasks: 2, inProgress: 1 } });
    } finally {
      await db.close();
    }
  });

  test("setup creates project, validates local repo path, links repo, applies built-in template, and records trace ids", async () => {
    const repoPath = await mkdtemp(join(tmpdir(), "fulcrum-workflow-repo-"));
    const db = await createTestOrm();
    try {
      const result = await createProjectFromSetup(db.em, ctx, {
        name: "Agent OS",
        slug: "agent-os",
        kind: "project",
        repoPath,
        template: AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID,
        trustMode: "manual",
      });

      expect(result.links.project.id).toBeTruthy();
      expect(result.links.repo.localPath).toBe(repoPath);
      expect(result.links.workflow.id).toBe("agent-os-software-project");
      expect(result.trace.audit).toEqual(expect.stringMatching(/^evt-/));
      expect(result.template.modules.map((module) => module.id)).toContain("docs");
    } finally {
      await db.close();
    }
  });

  test("project commands mutate project and task rows through scoped application service paths", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const project = await createProject(em, ctx, {
        slug: "command-mutations",
        name: "Command Mutations",
        kind: "project",
      });
      const projectCtx = { ...ctx, projectId: project.id };

      await expect(createProject(em, ctx, {
        slug: "orphan",
        name: "Orphan",
        parentId: "99999999-9999-4999-8999-999999999999",
      })).rejects.toThrow("parent project not found");

      await expect(updateProject(em, ctx, { id: project.id })).resolves.toEqual({ ok: true });
      await updateProject(em, ctx, { id: project.id, name: "Command Mutations Updated", description: "Updated" });

      const task = await createProjectTask(em, projectCtx, { title: "Project task", status: "pending" });
      await expect(rescheduleProjectTask(em, projectCtx, { taskId: "" })).rejects.toThrow("task id required");
      await expect(rescheduleProjectTask(em, projectCtx, { taskId: task.id })).resolves.toEqual({ ok: true });
      await rescheduleProjectTask(em, projectCtx, {
        taskId: task.id,
        startDate: "2026-05-10",
        dueDate: "2026-05-20",
      });
      await expect(rescheduleProjectTask(em, projectCtx, {
        taskId: "88888888-8888-4888-8888-888888888888",
        dueDate: "2026-05-20",
      })).rejects.toThrow("task not found");

      await expect(updateProjectTask(em, projectCtx, task.id, {})).resolves.toEqual({ ok: true });
      await updateProjectTask(em, projectCtx, task.id, {
        title: "Project task updated",
        status: "in_progress",
        priority: 7,
        description: "Task updated",
      });
      await deleteProjectTask(em, projectCtx, task.id);

      const rows = await em.getConnection().execute<Array<{
        name: string;
        description: string | null;
        title: string;
        status: string;
        priority: number;
        start_date: Date | string | null;
        due_date: Date | string | null;
        deleted_at: Date | string | null;
      }>>(
        `SELECT p.name, p.description, t.title, t.status, t.priority, t.start_date, t.due_date, t.deleted_at
           FROM projects p JOIN tasks t ON t.project_id = p.id::text
          WHERE p.id = ? AND t.id = ?`,
        [project.id, task.id],
      );
      expect(rows[0]).toMatchObject({
        name: "Command Mutations Updated",
        description: "Updated",
        title: "Project task updated",
        status: "in_progress",
        priority: 7,
      });
      expect(rows[0]!.start_date).toBeTruthy();
      expect(rows[0]!.due_date).toBeTruthy();
      expect(rows[0]!.deleted_at).toBeTruthy();

      await deleteProject(em, ctx, project.id);
      await expect(getProjectOrNull(em, ctx, project.id)).resolves.toBeNull();
    } finally {
      await db.close();
    }
  });

  test("setup without repo still records template workflow and missing repo trace", async () => {
    const db = await createTestOrm();
    try {
      const result = await createProjectFromSetup(db.em, ctx, {
        name: "No Repo Setup",
        template: AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID,
        trustMode: "trusted",
      });

      expect(result.links.project.slug).toBe("no-repo-setup");
      expect(result.links.repo).toEqual({ id: "", localPath: null, syncStatus: "missing" });
      expect(result.links.workflow.id).toBe(AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID);
      expect(result.trace.audit).toEqual(expect.stringMatching(/^evt-/));
    } finally {
      await db.close();
    }
  });

  test("project read models list rows, options, activity, board, calendar, and gantt from real rows", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const project = await createProject(em, ctx, {
        slug: "read-model",
        name: "Read Model",
        kind: "project",
        description: "Project read model coverage",
      });
      const taskA = crypto.randomUUID();
      const taskB = crypto.randomUUID();
      const relationId = crypto.randomUUID();
      const sprintId = crypto.randomUUID();
      await em.getConnection().execute(
        `INSERT INTO sprints (id, org_id, project_id, name, status, start_date, end_date, created_at, updated_at)
         VALUES (?, ?, ?, 'Active Sprint', 'active', '2026-05-01', '2026-05-15', now(), now())`,
        [sprintId, DEFAULT_ORG_ID, project.id],
      );
      await em.getConnection().execute(
        `INSERT INTO tasks (id, org_id, project_id, title, status, priority, sprint_id, created_at, updated_at)
         VALUES
           (?, ?, ?, 'Todo task', 'pending', 2, ?, now() - interval '2 days', now() - interval '1 day'),
           (?, ?, ?, 'Done task', 'completed', 1, NULL, now() - interval '1 day', now())`,
        [taskA, DEFAULT_ORG_ID, project.id, sprintId, taskB, DEFAULT_ORG_ID, project.id],
      );
      await em.getConnection().execute(
        `INSERT INTO task_relationships (id, org_id, source_task_id, target_task_id, type, created_by, created_at)
         VALUES (?, ?, ?, ?, 'blocks', ?, now())`,
        [relationId, DEFAULT_ORG_ID, taskA, taskB, crypto.randomUUID()],
      );
      await em.getConnection().execute(
        `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
         VALUES (?, ?, ?, ?, 'task', ?, 'created', ?::jsonb, now())`,
        [crypto.randomUUID(), DEFAULT_ORG_ID, project.id, ctx.userId, taskA, JSON.stringify({ title: "Todo task" })],
      );

      const projectCtx = { ...ctx, projectId: project.id };
      await expect(listProjectRows(em, ctx)).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: project.id, slug: "read-model", description: "Project read model coverage" }),
      ]));
      await expect(resolveProjectIdByKey(em, ctx, "read-model")).resolves.toBe(project.id);
      await expect(resolveProjectIdByKey(em, ctx, project.id)).resolves.toBe(project.id);
      await expect(getProjectOrNull(em, ctx, project.id)).resolves.toMatchObject({ id: project.id, slug: "read-model" });
      await expect(listProjectOptions(em, ctx)).resolves.toEqual(expect.arrayContaining([
        { id: project.id, name: "Read Model" },
      ]));
      await expect(listProjectBoardTasks(em, projectCtx)).resolves.toEqual([
        expect.objectContaining({ id: taskB, title: "Done task", status: "completed" }),
        expect.objectContaining({ id: taskA, title: "Todo task", status: "pending", sprint_id: sprintId }),
      ]);
      await expect(listProjectActivityEvents(em, projectCtx, { subjectKind: "task", verb: "created", actorId: ctx.userId, limit: 5 }))
        .resolves.toEqual([expect.objectContaining({ subject_id: taskA, payload: { title: "Todo task" } })]);
      await expect(loadProjectCalendar(em, projectCtx)).resolves.toMatchObject({
        projectId: project.id,
        activeSprint: { id: sprintId, start_date: "2026-05-01", end_date: "2026-05-15" },
        tasks: expect.arrayContaining([expect.objectContaining({ id: taskA }), expect.objectContaining({ id: taskB })]),
      });
      await expect(loadProjectGantt(em, projectCtx)).resolves.toMatchObject({
        projectId: project.id,
        relationships: [{ id: relationId, sourceTaskId: taskA, targetTaskId: taskB, type: "blocks" }],
      });
    } finally {
      await db.close();
    }
  });
});

describe("Workflow template normalization and trust policy", () => {
  test("normalizes built-in, markdown, and directory templates through one schema", async () => {
    const root = await mkdtemp(join(tmpdir(), "fulcrum-workflow-template-"));
    const markdownPath = join(root, "FULCRUM_TEMPLATE.md");
    const directoryPath = join(root, "template-dir");
    await mkdir(directoryPath);
    await writeFile(markdownPath, [
      "---",
      "id: local-markdown",
      "name: Local Markdown",
      "modules: [docs, work]",
      "---",
      "# Local Markdown",
    ].join("\n"));
    await writeFile(join(directoryPath, "fulcrum-template.yaml"), [
      "id: local-directory",
      "name: Local Directory",
      "modules:",
      "  - docs",
      "  - repo",
    ].join("\n"));

    const builtIn = normalizeTemplate(await loadTemplateSource({ kind: "built-in", id: AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID }));
    const markdown = normalizeTemplate(await loadTemplateSource({ kind: "markdown", path: markdownPath }));
    const directory = normalizeTemplate(await loadTemplateSource({ kind: "directory", path: directoryPath }), { removeModules: ["repo"] });

    expect(builtIn.id).toBe(AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID);
    expect(builtIn.modules).toContainEqual({ id: "repo", label: "Repo" });
    expect(builtIn.modules).toContainEqual({ id: "workflow", label: "Workflow" });
    expect(markdown).toMatchObject({ id: "local-markdown", modules: [{ id: "docs" }, { id: "work" }] });
    expect(directory.modules.map((module) => module.id)).toEqual(["docs"]);
  });

  test("dry-runs executable template effects unless explicit full-auto trust policy permits execution", async () => {
    const template = normalizeTemplate({
      id: "exec-template",
      name: "Exec Template",
      modules: ["repo"],
      effects: [{ id: "hook-1", kind: "hook", command: "bun test", destructive: false }],
    });

    expect(previewTemplateEffects(template, { trustMode: "manual" })).toEqual([
      expect.objectContaining({ id: "hook-1", dryRun: true, approvalRequired: true }),
    ]);
    expect(evaluateTemplateTrustPolicy({ trustMode: "full-auto", allowExecutableEffects: true }, template.effects[0]!))
      .toMatchObject({ canExecute: true, auditRequired: true });
    expect(evaluateTemplateTrustPolicy({ trustMode: "trusted", allowExecutableEffects: false }, template.effects[0]!))
      .toMatchObject({ canExecute: false, approvalRequired: true });
  });
});
