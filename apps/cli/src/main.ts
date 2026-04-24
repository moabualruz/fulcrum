import { Command } from "commander";
import {
  ArtifactService,
  LocalArtifactStorage,
  resolveSetupPaths,
  type ArtifactRepositoryPort
} from "@fulcrum/core";
import type { ArtifactContract } from "@fulcrum/shared";
import {
  attachArtifactCommand,
  listRunArtifactsCommand,
  showArtifactCommand
} from "./commands/artifact.js";
import { doctorCommand } from "./commands/doctor.js";
import { listProjectsCommand, registerProjectCommand } from "./commands/project.js";
import { setupApplyCommand, setupPreviewCommand } from "./commands/setup.js";
import { createTaskCommand, listTasksCommand, transitionTaskCommand } from "./commands/task.js";
import { createCliSetupPorts } from "./runtime.js";
import { projectService, taskService } from "./work-runtime.js";

class MemoryArtifactRepository implements ArtifactRepositoryPort {
  private readonly artifacts = new Map<string, ArtifactContract>();

  save(artifact: ArtifactContract): ArtifactContract {
    this.artifacts.set(artifact.artifactId, artifact);
    return artifact;
  }

  get(artifactId: string): ArtifactContract | undefined {
    return this.artifacts.get(artifactId);
  }

  listByRun(runId: string): ArtifactContract[] {
    return [...this.artifacts.values()].filter((artifact) => artifact.runId === runId);
  }
}

const program = new Command();

program
  .name("fulcrum")
  .description("Local-first CLI Agent OS")
  .version("0.1.0")
  .option("--json", "emit machine-readable JSON")
  .option("--config <path>", "use explicit Fulcrum config file")
  .option("--local-only", "deny remote actions unless policy allows");

const setupCommand = program.command("setup").description("Preview or apply local setup");

setupCommand
  .command("preview")
  .description("Show setup effects without mutation")
  .action(() => {
    const payload = setupPreviewCommand();
    console.log(
      program.opts().json ? JSON.stringify(payload, null, 2) : "Fulcrum setup preview ready"
    );
  });

setupCommand
  .command("apply")
  .description("Apply local setup")
  .action(async () => {
    const ports = await createCliSetupPorts();
    const payload = await setupApplyCommand(ports);
    console.log(program.opts().json ? JSON.stringify(payload, null, 2) : "Fulcrum setup applied");
  });

program
  .command("setup:preview")
  .description("Compatibility alias for setup preview")
  .action(() => {
    const payload = setupPreviewCommand();
    console.log(
      program.opts().json ? JSON.stringify(payload, null, 2) : "Fulcrum setup preview ready"
    );
  });

program
  .command("setup:apply")
  .description("Compatibility alias for setup apply")
  .action(async () => {
    const ports = await createCliSetupPorts();
    const payload = await setupApplyCommand(ports);
    console.log(program.opts().json ? JSON.stringify(payload, null, 2) : "Fulcrum setup applied");
  });

program
  .command("doctor")
  .description("Report local capability and privacy health")
  .option("--no-network", "avoid network checks")
  .action(async (options) => {
    const ports = await createCliSetupPorts();
    const payload = doctorCommand({
      setupRepository: ports.setupRepository,
      setupState: await ports.latest(),
      noNetwork: options.network === false || Boolean(options.noNetwork)
    });
    console.log(program.opts().json ? JSON.stringify(payload, null, 2) : "Fulcrum doctor ready");
  });

const artifactService = new ArtifactService(
  new MemoryArtifactRepository(),
  new LocalArtifactStorage(resolveSetupPaths().artifactRoot)
);
const artifactCommand = program.command("artifact").description("Attach, show, or list artifacts");

artifactCommand
  .command("attach")
  .requiredOption("--type <type>")
  .requiredOption("--local-ref <path>")
  .requiredOption("--summary <summary>")
  .option("--run <runId>")
  .option("--task <taskId>")
  .option("--project <projectId>")
  .action(async (options) => {
    const data = await attachArtifactCommand(
      { artifacts: artifactService },
      {
        type: options.type,
        localRef: options.localRef,
        summary: options.summary,
        runId: options.run,
        taskId: options.task,
        projectId: options.project
      }
    );
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.artifactId
    );
  });

artifactCommand.command("show <artifactId>").action((artifactId) => {
  const data = showArtifactCommand({ artifacts: artifactService }, artifactId);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: "1.0", status: data ? "ok" : "error", data }, null, 2)
      : (data?.summary ?? "Artifact not found")
  );
});

artifactCommand
  .command("list")
  .requiredOption("--run <runId>")
  .action((options) => {
    const data = listRunArtifactsCommand({ artifacts: artifactService }, options.run);
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.length} artifacts`
    );
  });

const projectCommand = program.command("project").description("Register and list local projects");

projectCommand
  .command("register <rootPath>")
  .option("--name <name>")
  .action((rootPath, options) => {
    const data = registerProjectCommand(projectService, { rootPath, name: options.name });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.projectId
    );
  });

projectCommand.command("list").action(() => {
  const data = listProjectsCommand(projectService);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
      : `${data.length} projects`
  );
});

const taskCommand = program.command("task").description("Create, list, and transition local tasks");

taskCommand
  .command("create")
  .requiredOption("--project <projectId>")
  .requiredOption("--title <title>")
  .option("--description <description>")
  .option("--priority <priority>")
  .option("--label <label...>")
  .action((options) => {
    const data = createTaskCommand(taskService, {
      projectId: options.project,
      title: options.title,
      description: options.description,
      priority: options.priority,
      labels: options.label
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.taskId
    );
  });

taskCommand
  .command("list")
  .option("--project <projectId>")
  .action((options) => {
    const data = listTasksCommand(taskService, options.project);
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.length} tasks`
    );
  });

taskCommand.command("transition <taskId> <status>").action((taskId, status) => {
  const data = transitionTaskCommand(taskService, taskId, status);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
      : data.status
  );
});

program.parse();
