import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm } from "../../test-utils/db.ts";
import { createProject, createProjectFromSetup } from "./commands.ts";
import { getProjectHierarchy, loadProjectOverview } from "./queries.ts";
import {
  AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID,
  loadTemplateSource,
  normalizeTemplate,
  previewTemplateEffects,
} from "../templates/engine.ts";
import { evaluateTemplateTrustPolicy } from "../project-policy/trust.ts";

const ctx = { orgId: DEFAULT_ORG_ID, userId: "user-phase96", projectId: null };

describe("Phase 09.6 project hierarchy and setup", () => {
  test("supports workspace/project/subproject/deep child hierarchy and aggregate dashboard scope", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
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

      await em.getKysely<any>().insertInto("tasks").values([
        { id: crypto.randomUUID(), org_id: ctx.orgId, project_id: project.id, title: "Parent task", status: "pending" },
        { id: crypto.randomUUID(), org_id: ctx.orgId, project_id: leaf.id, title: "Leaf task", status: "in_progress" },
      ]).execute();

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
    const repoPath = await mkdtemp(join(tmpdir(), "fulcrum-phase96-repo-"));
    const db = await createTestOrm();
    try {
      const result = await createProjectFromSetup(db.em.fork(), ctx, {
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
});

describe("Phase 09.6 template normalization and trust policy", () => {
  test("normalizes built-in, markdown, and directory templates through one schema", async () => {
    const root = await mkdtemp(join(tmpdir(), "fulcrum-phase96-template-"));
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
