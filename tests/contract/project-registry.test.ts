import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectRegistryService, type ProjectRepositoryPort } from "@fulcrum/core";
import type { Project } from "@fulcrum/shared";

class MemoryProjectRepository implements ProjectRepositoryPort {
  projects = new Map<string, Project>();

  save(project: Project): Project {
    this.projects.set(project.projectId, project);
    return project;
  }

  get(projectId: string): Project | undefined {
    return this.projects.get(projectId);
  }

  findByRoot(rootPath: string): Project | undefined {
    return [...this.projects.values()].find((project) => project.rootPath === rootPath);
  }

  list(): Project[] {
    return [...this.projects.values()];
  }
}

describe("project registry contract", () => {
  it("registers local roots with stable IDs and local-only health metadata", () => {
    const repo = new MemoryProjectRepository();
    const service = new ProjectRegistryService(repo);
    const rootPath = mkdtempSync(path.join(tmpdir(), "fulcrum-project-"));

    const project = service.register({ rootPath, name: "Local App" });
    const duplicate = service.register({ rootPath, name: "Changed Name" });

    expect(project.projectId).toMatch(/^proj_/);
    expect(duplicate.projectId).toBe(project.projectId);
    expect(project.rootPath).toBe(rootPath);
    expect(project.defaultBranch).toBe("main");
    expect(project.worktreePolicyId).toMatch(/^pol_/);
    expect(project.ignoredPathPolicyId).toMatch(/^pol_/);
    expect(project.qualityGateSetId).toMatch(/^gate_/);
    expect(project.enabledCapabilities).toContain("cap_local_tasks");
    expect(project.privacyMode).toBe("local_only");
    expect(project.healthState).toBe("managed");
  });

  it("marks missing roots degraded instead of failing registration", () => {
    const service = new ProjectRegistryService(new MemoryProjectRepository());
    const project = service.register({ rootPath: "/tmp/fulcrum-missing-project-root" });

    expect(project.healthState).toBe("degraded");
  });
});
