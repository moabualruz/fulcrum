import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  createProject,
  createRepo,
  createTask,
} from "../../../../../../product-kernel/store/repositories.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-project-repos-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedProjectWithRepos() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: "alpha",
    name: "Alpha",
  });
  const otherProject = await createProject(db, {
    orgId: org.id,
    slug: "beta",
    name: "Beta",
  });
  const repo1 = await createRepo(db, {
    orgId: org.id,
    projectId: project.id,
    slug: "fulcrum",
    rootPath: "/workspace/fulcrum",
    name: "Fulcrum",
    kind: "local",
    localPath: "/workspace/fulcrum",
  });
  const repo2 = await createRepo(db, {
    orgId: org.id,
    projectId: project.id,
    slug: "ui",
    rootPath: "",
    remoteUrl: "https://example.test/ui.git",
    name: "UI Lib",
    kind: "remote",
  });
  // Repo in other project — should NOT appear
  await createRepo(db, {
    orgId: org.id,
    projectId: otherProject.id,
    slug: "other",
    rootPath: "/other",
    name: "Other",
    kind: "local",
    localPath: "/other",
  });
  // Unlinked repo (no project_id)
  const unlinkedRepo = await createRepo(db, {
    orgId: org.id,
    projectId: null,
    slug: "orphan",
    rootPath: "/orphan",
    name: "Orphan",
    kind: "local",
    localPath: "/orphan",
  });
  // Task with open status for counting
  await createTask(db, {
    orgId: org.id,
    projectId: project.id,
    title: "Task 1",
    status: "pending",
  });
  await db.close();
  return {
    orgId: org.id,
    projectId: project.id,
    otherProjectId: otherProject.id,
    repo1Id: repo1.id,
    repo2Id: repo2.id,
    unlinkedRepoId: unlinkedRepo.id,
  };
}

describe("/projects/[id]/repos +page.server.ts", () => {
  test("load returns only repos scoped to the given project", async () => {
    const { projectId, repo1Id, repo2Id } = await seedProjectWithRepos();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: projectId },
    } as Parameters<typeof mod.load>[0]);
    expect(result.repos.length).toBe(2);
    const ids = result.repos.map((r: { id: string }) => r.id);
    expect(ids).toContain(repo1Id);
    expect(ids).toContain(repo2Id);
  });

  test("each repo card has expected fields", async () => {
    const { projectId } = await seedProjectWithRepos();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      params: { id: projectId },
    } as Parameters<typeof mod.load>[0]);
    const repo = result.repos.find((r: { slug: string }) => r.slug === "fulcrum");
    expect(repo).toBeDefined();
    expect(repo.name).toBe("Fulcrum");
    expect(repo.kind).toBe("local");
    expect(repo.currentBranch).toBe("main");
    expect(repo.syncStatus).toBe("idle");
  });

  test("load throws 404 for nonexistent project", async () => {
    await seedProjectWithRepos();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    let caught: unknown;
    try {
      await mod.load({
        params: { id: "01JBOGUS000000000000000000" },
      } as Parameters<typeof mod.load>[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      typeof caught === "object" &&
        caught !== null &&
        "status" in caught &&
        (caught as { status: number }).status === 404,
    ).toBe(true);
  });

  test("add action creates a repo pre-linked to the project", async () => {
    const { projectId } = await seedProjectWithRepos();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const fd = new FormData();
    fd.set("kind", "local");
    fd.set("path", "/tmp/new-repo");
    fd.set("name", "New Repo");
    const request = new Request("http://localhost/projects/x/repos", {
      method: "POST",
      body: fd,
    });
    const result = await mod.actions.add({
      params: { id: projectId },
      request,
    } as Parameters<typeof mod.actions.add>[0]);
    expect(result).toEqual({ ok: true });
    // Verify it shows up in load
    const loadResult = await mod.load({
      params: { id: projectId },
    } as Parameters<typeof mod.load>[0]);
    const newRepo = loadResult.repos.find(
      (r: { name: string }) => r.name === "New Repo",
    );
    expect(newRepo).toBeDefined();
  });

  test("link action links an existing unlinked repo to the project", async () => {
    const { projectId, unlinkedRepoId } = await seedProjectWithRepos();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const fd = new FormData();
    fd.set("repoId", unlinkedRepoId);
    const request = new Request("http://localhost/projects/x/repos", {
      method: "POST",
      body: fd,
    });
    const result = await mod.actions.link({
      params: { id: projectId },
      request,
    } as Parameters<typeof mod.actions.link>[0]);
    expect(result).toEqual({ ok: true });
    // Verify it shows up
    const loadResult = await mod.load({
      params: { id: projectId },
    } as Parameters<typeof mod.load>[0]);
    const linked = loadResult.repos.find(
      (r: { id: string }) => r.id === unlinkedRepoId,
    );
    expect(linked).toBeDefined();
  });
});
