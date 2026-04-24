import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type { InstallTarget } from "@fulcrum/shared";

export type InstallTargetProbeStatus = InstallTarget["status"];

export interface InstallTargetProbe extends InstallTarget {
  checkedAt: string;
  nextAction: string;
}

export interface InstallTargetProbeInput {
  rootDir?: string;
}

type InstallTargetDefinition = Omit<InstallTarget, "status" | "validationEvidence">;

const OPTIONAL_TARGET_IDS = new Set(["pnpm-dlx", "bun-binary"]);

const INSTALL_TARGETS: InstallTargetDefinition[] = [
  {
    targetId: "source",
    command: "pnpm start -- --help",
    runtime: "pnpm",
    artifactPath: "apps/cli/dist/main.js",
    requiredCapabilities: ["cli", "package-runner"],
    schemaVersion: "1.0"
  },
  {
    targetId: "npm",
    command: "npm exec fulcrum -- --help",
    runtime: "npm",
    artifactPath: "apps/cli/dist/main.js",
    requiredCapabilities: ["cli", "package-runner"],
    schemaVersion: "1.0"
  },
  {
    targetId: "pnpm-dlx",
    command: "pnpm dlx fulcrum --help",
    runtime: "pnpm",
    requiredCapabilities: ["package-publish"],
    schemaVersion: "1.0"
  },
  {
    targetId: "bun-binary",
    command: "./fulcrum --help",
    runtime: "Bun",
    artifactPath: "dist/fulcrum",
    requiredCapabilities: ["bun-runtime"],
    schemaVersion: "1.0"
  },
  {
    targetId: "fulcrum-setup",
    command: "fulcrum setup apply --json",
    runtime: "binary",
    artifactPath: "apps/cli/dist/main.js",
    requiredCapabilities: ["sqlite", "local-state"],
    schemaVersion: "1.0"
  },
  {
    targetId: "fulcrum-doctor",
    command: "fulcrum doctor --json --no-network",
    runtime: "binary",
    artifactPath: "apps/cli/dist/main.js",
    requiredCapabilities: ["doctor", "local-only"],
    schemaVersion: "1.0"
  },
  {
    targetId: "fulcrum-server",
    command: "fulcrum server start --bind 127.0.0.1:3410",
    runtime: "Node",
    artifactPath: "apps/server/dist/main.js",
    requiredCapabilities: ["loopback-server"],
    schemaVersion: "1.0"
  },
  {
    targetId: "fulcrum-cockpit",
    command: "pnpm --filter @fulcrum/cockpit build",
    runtime: "Node",
    artifactPath: "apps/cockpit/dist/index.html",
    requiredCapabilities: ["cockpit-assets"],
    schemaVersion: "1.0"
  },
  {
    targetId: "fulcrum-tui",
    command: "pnpm start:tui",
    runtime: "Node",
    artifactPath: "apps/tui/dist/main.js",
    requiredCapabilities: ["terminal-ui"],
    schemaVersion: "1.0"
  },
  {
    targetId: "fulcrum-mcp",
    command: "fulcrum mcp stdio",
    runtime: "binary",
    artifactPath: "packages/mcp/dist/index.js",
    requiredCapabilities: ["mcp-stdio"],
    schemaVersion: "1.0"
  }
];

function artifactStatus(
  rootDir: string,
  target: InstallTargetDefinition
): InstallTargetProbeStatus {
  if (target.targetId === "pnpm-dlx") return "degraded";
  if (!target.artifactPath) return "guided";
  const absolutePath = path.resolve(rootDir, target.artifactPath);
  if (target.targetId === "bun-binary") {
    return existsSync(absolutePath) && statSync(absolutePath).isFile() ? "managed" : "degraded";
  }
  return existsSync(absolutePath) && statSync(absolutePath).isFile() ? "managed" : "guided";
}

export function listInstallTargetProbes(input: InstallTargetProbeInput = {}): InstallTargetProbe[] {
  const rootDir = input.rootDir ?? process.cwd();
  const checkedAt = new Date().toISOString();
  return INSTALL_TARGETS.map((target) => {
    const status = artifactStatus(rootDir, target);
    return {
      ...target,
      status,
      validationEvidence: status === "managed" ? [`file:${target.artifactPath}`] : [],
      checkedAt,
      nextAction:
        status === "managed"
          ? `${target.command} is available from packaged artifacts.`
          : target.targetId === "pnpm-dlx"
            ? "Published pnpm dlx package not available yet. Use pnpm start or pnpm exec fulcrum from the checkout."
            : target.targetId === "bun-binary"
              ? "Bun single-binary target is not packaged yet. Use the Node-based package runner instead."
              : `Run pnpm build:package before using ${target.command}.`
    };
  });
}

export function packageInstallReady(input: InstallTargetProbeInput = {}): boolean {
  return listInstallTargetProbes(input).every(
    (target) => target.status === "managed" || OPTIONAL_TARGET_IDS.has(target.targetId)
  );
}
