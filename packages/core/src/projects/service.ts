import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { makeId, SCHEMA_VERSION, ProjectSchema, type Project, type Task } from "@fulcrum/shared";

export interface ProjectRepositoryPort {
  save(project: Project): Project;
  get(projectId: string): Project | undefined;
  findByRoot?(rootPath: string): Project | undefined;
  list(): Project[];
}

export interface ProjectRegistryInput {
  rootPath: string;
  name?: string;
  defaultBranch?: string;
  privacyMode?: Project["privacyMode"];
  worktreePolicyId?: string;
  ignoredPathPolicyId?: string;
  qualityGateSetId?: string;
  enabledCapabilities?: string[];
  disabledCapabilities?: string[];
}

export interface ProjectOverview {
  project: Project;
  counts: {
    tasks: number;
    runs: number;
    blockers: number;
    review: number;
    merge: number;
  };
  degraded: string[];
}

export interface ProjectTaskPort {
  list(projectId?: string): Task[];
}

export class ProjectRegistryService {
  constructor(
    private readonly projects: ProjectRepositoryPort,
    private readonly tasks?: ProjectTaskPort
  ) {}

  register(input: ProjectRegistryInput): Project {
    const rootPath = path.resolve(input.rootPath);
    const existing = this.projects.findByRoot?.(rootPath);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const defaultBranch = input.defaultBranch ?? detectDefaultBranch(rootPath);
    const healthState = existsSync(rootPath) ? "managed" : "degraded";
    return this.projects.save(
      ProjectSchema.parse({
        projectId: makeId("proj", `${rootPath}-${defaultBranch}`),
        name: input.name ?? path.basename(rootPath),
        rootPath,
        defaultBranch,
        worktreePolicyId: input.worktreePolicyId ?? makeId("pol", `${rootPath}-worktree`),
        ignoredPathPolicyId:
          input.ignoredPathPolicyId ?? makeId("pol", `${rootPath}-ignored-paths`),
        qualityGateSetId: input.qualityGateSetId ?? makeId("gate", `${rootPath}-default`),
        privacyMode: input.privacyMode ?? "local_only",
        healthState,
        enabledCapabilities: input.enabledCapabilities ?? ["cap_local_tasks"],
        disabledCapabilities: input.disabledCapabilities ?? [],
        adapterMappings: {},
        lastScannedAt: now,
        createdAt: now,
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION
      })
    );
  }

  list(): Project[] {
    return this.projects.list();
  }

  get(projectId: string): Project | undefined {
    return this.projects.get(projectId);
  }

  overview(): ProjectOverview[] {
    return this.projects.list().map((project) => {
      const tasks = this.tasks?.list(project.projectId) ?? [];
      return {
        project,
        counts: {
          tasks: tasks.length,
          runs: tasks.filter((task) => task.currentRunId).length,
          blockers: tasks.filter((task) => task.status === "blocked").length,
          review: tasks.filter((task) => task.status === "review").length,
          merge: tasks.filter((task) => task.labels.includes("merge")).length
        },
        degraded: project.healthState === "degraded" ? ["project_root"] : []
      };
    });
  }
}

function detectDefaultBranch(rootPath: string): string {
  try {
    return (
      execFileSync("git", ["-C", rootPath, "branch", "--show-current"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim() || "main"
    );
  } catch {
    return "main";
  }
}
