import type { ApprovedPlanArtifactKind } from "@planning-review/application/approved-plan-breakdown.ts";

export type PlanningArtifactPreviewMode = "web-route" | "test-file" | "source-module" | "unknown";

export interface PlanningArtifactPreviewInput {
  kind: ApprovedPlanArtifactKind;
  path: string;
  sourcePlanId?: string;
  traceId?: string;
}

export interface PlanningArtifactPreview {
  id: string;
  kind: ApprovedPlanArtifactKind;
  path: string;
  label: string;
  mode: PlanningArtifactPreviewMode;
  sourcePlanId?: string;
  traceId?: string;
  urlPath?: string;
  run?: {
    command: string;
    args: string[];
  };
  reviewChecks: string[];
}

export function buildPlanningArtifactPreviews(input: {
  artifacts: PlanningArtifactPreviewInput[];
}): PlanningArtifactPreview[] {
  return input.artifacts.map((artifact) => {
    const mode = previewMode(artifact.path);
    return {
      id: previewId(artifact.kind, artifact.path),
      kind: artifact.kind,
      path: artifact.path,
      label: labelFor(artifact.kind, artifact.path),
      mode,
      ...(artifact.sourcePlanId ? { sourcePlanId: artifact.sourcePlanId } : {}),
      ...(artifact.traceId ? { traceId: artifact.traceId } : {}),
      ...(urlPathFor(artifact.path) ? { urlPath: urlPathFor(artifact.path) } : {}),
      ...(runFor(mode, artifact.path) ? { run: runFor(mode, artifact.path) } : {}),
      reviewChecks: reviewChecksFor(artifact.kind, mode),
    };
  });
}

function previewMode(path: string): PlanningArtifactPreviewMode {
  if (path.includes("/src/routes/")) return "web-route";
  if (/(\.test|\.spec)\.[cm]?[tj]sx?$/.test(path)) return "test-file";
  if (/\.[cm]?[tj]sx?$/.test(path)) return "source-module";
  return "unknown";
}

function urlPathFor(path: string): string | undefined {
  const marker = "/src/routes/";
  const index = path.indexOf(marker);
  if (index === -1) return undefined;
  const routePart = path.slice(index + marker.length);
  const segments = routePart.split("/").filter(Boolean);
  if (segments.length === 0) return "/";
  const last = segments.at(-1) ?? "";
  if (last.startsWith("+")) segments.pop();
  else if (last.includes(".")) segments.pop();
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

function runFor(
  mode: PlanningArtifactPreviewMode,
  path: string,
): PlanningArtifactPreview["run"] | undefined {
  if (mode === "test-file") return { command: "bun", args: ["test", path] };
  if (mode === "source-module") return { command: "bun", args: ["-e", `await import("./${path}")`] };
  if (mode === "web-route") return { command: "bun", args: ["run", "--cwd", "apps/web", "test"] };
  return undefined;
}

function reviewChecksFor(kind: ApprovedPlanArtifactKind, mode: PlanningArtifactPreviewMode): string[] {
  const shared = [
    "Trace ID and source context are visible before approval.",
    "Reviewer can decide whether this artifact preserves the requested workflow value.",
  ];
  if (kind === "prototype") {
    return [
      "Prototype demonstrates the intended user flow before task materialization.",
      mode === "web-route" ? "Prototype route can be opened from the generated URL path." : "Prototype has a runnable preview command or explicit replacement.",
      ...shared,
    ];
  }
  return [
    "Boilerplate names the service or interface responsibility it prepares.",
    "Boilerplate can be imported or tested before task materialization.",
    ...shared,
  ];
}

function labelFor(kind: ApprovedPlanArtifactKind, path: string): string {
  const name = path.split("/").at(-1) || path;
  return `${kind}: ${name}`;
}

function previewId(kind: ApprovedPlanArtifactKind, path: string): string {
  return `${kind}-${path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`;
}
