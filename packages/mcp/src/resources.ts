import type {
  ArtifactService,
  ContextPackBuilder,
  ProjectRegistryService,
  RunLifecycleService,
  LocalTaskService
} from "@fulcrum/core";

export interface McpResourceRuntime {
  projects: ProjectRegistryService;
  tasks: LocalTaskService;
  runs: RunLifecycleService;
  context: ContextPackBuilder;
  artifacts: ArtifactService;
  doctor: (input?: {
    projectId?: string;
    deep?: boolean;
    noNetwork?: boolean;
  }) => unknown | Promise<unknown>;
}

export interface McpResourceDefinition {
  name: string;
  uri: string;
  description: string;
  read: (uri: URL) => Promise<unknown>;
}

export function createMcpResourceDefinitions(runtime: McpResourceRuntime): McpResourceDefinition[] {
  return [
    {
      name: "fulcrum-project",
      uri: "fulcrum://projects/{projectId}",
      description: "Project summary resource.",
      read: async (uri) => {
        const project = runtime.projects.get(lastPath(uri));
        if (!project) throw new Error(`Project not found: ${lastPath(uri)}`);
        return project;
      }
    },
    {
      name: "fulcrum-task",
      uri: "fulcrum://tasks/{taskId}",
      description: "Task detail resource.",
      read: async (uri) => {
        const task = runtime.tasks.get(lastPath(uri));
        if (!task) throw new Error(`Task not found: ${lastPath(uri)}`);
        return task;
      }
    },
    {
      name: "fulcrum-run",
      uri: "fulcrum://runs/{runId}",
      description: "Run detail and event refs resource.",
      read: async (uri) => {
        const run = runtime.runs.get(lastPath(uri));
        if (!run) throw new Error(`Run not found: ${lastPath(uri)}`);
        return { run, events: runtime.runs.events(run.runId) };
      }
    },
    {
      name: "fulcrum-context-pack",
      uri: "fulcrum://context-packs/{contextPackId}",
      description: "Context pack resource.",
      read: async (uri) => {
        const pack = runtime.context.get(lastPath(uri));
        if (!pack) throw new Error(`Context pack not found: ${lastPath(uri)}`);
        return pack;
      }
    },
    {
      name: "fulcrum-artifact",
      uri: "fulcrum://artifacts/{artifactId}",
      description: "Artifact metadata and local reference resource.",
      read: async (uri) => {
        const artifact = runtime.artifacts.show(lastPath(uri));
        if (!artifact) throw new Error(`Artifact not found: ${lastPath(uri)}`);
        return artifact;
      }
    },
    {
      name: "fulcrum-doctor",
      uri: "fulcrum://doctor",
      description: "Local Fulcrum health resource.",
      read: async () => runtime.doctor()
    }
  ];
}

function lastPath(uri: URL): string {
  return uri.pathname.split("/").filter(Boolean).at(-1) ?? uri.hostname;
}
