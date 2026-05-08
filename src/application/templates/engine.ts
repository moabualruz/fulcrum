import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { evaluateTemplateTrustPolicy, type TemplateEffectPolicy, type TemplateTrustMode } from "../project-policy/trust.ts";

export const AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID = "agent-os-software-project";

const TemplateEffectSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  command: z.string().optional(),
  destructive: z.boolean().optional(),
  authorityEscalation: z.boolean().optional(),
});

const TemplateSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  modules: z.array(z.union([z.string(), z.object({ id: z.string().min(1), label: z.string().optional() })])).default([]),
  projectTree: z.array(z.object({ name: z.string(), kind: z.string().optional(), slug: z.string().optional() })).default([]),
  docs: z.array(z.object({ title: z.string(), kind: z.string().optional() })).default([]),
  workItems: z.array(z.object({ title: z.string(), kind: z.string().optional() })).default([]),
  policies: z.record(z.string(), z.unknown()).default({}),
  automations: z.array(z.record(z.string(), z.unknown())).default([]),
  reports: z.array(z.record(z.string(), z.unknown())).default([]),
  effects: z.array(TemplateEffectSchema).default([]),
});

export type RawTemplateSource = z.input<typeof TemplateSourceSchema>;
export type NormalizedTemplate = Omit<z.output<typeof TemplateSourceSchema>, "modules"> & {
  modules: Array<{ id: string; label: string }>;
  workflow: { id: string; name: string };
};

export type TemplateSourceRef =
  | { kind: "built-in"; id: string }
  | { kind: "markdown"; path: string }
  | { kind: "directory"; path: string };

export interface NormalizeTemplateOptions {
  removeModules?: string[];
}

export async function loadTemplateSource(ref: TemplateSourceRef): Promise<RawTemplateSource> {
  if (ref.kind === "built-in") {
    if (ref.id !== AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID) throw new Error(`unknown built-in template: ${ref.id}`);
    return agentOsSoftwareProjectTemplate();
  }
  if (ref.kind === "markdown") return parseMarkdownTemplate(await readFile(ref.path, "utf8"));
  return TemplateSourceSchema.parse(parseYaml(await readFile(join(ref.path, "fulcrum-template.yaml"), "utf8")));
}

export function normalizeTemplate(source: RawTemplateSource, options: NormalizeTemplateOptions = {}): NormalizedTemplate {
  const parsed = TemplateSourceSchema.parse(source);
  const removed = new Set(options.removeModules ?? []);
  const modules = parsed.modules
    .map((module) => typeof module === "string" ? { id: module, label: labelFromId(module) } : { id: module.id, label: module.label ?? labelFromId(module.id) })
    .filter((module) => !removed.has(module.id));

  return {
    ...parsed,
    modules,
    workflow: { id: parsed.id, name: parsed.name },
  };
}

export function previewTemplateEffects(
  template: Pick<NormalizedTemplate, "effects">,
  policy: Pick<TemplateEffectPolicy, "trustMode"> & Partial<TemplateEffectPolicy>,
): Array<{ id: string; kind: string; dryRun: boolean; approvalRequired: boolean; auditRequired: boolean }> {
  return template.effects.map((effect) => ({
    id: effect.id,
    kind: effect.kind,
    ...evaluateTemplateTrustPolicy(policy as TemplateEffectPolicy, effect),
  }));
}

export function agentOsSoftwareProjectTemplate(): RawTemplateSource {
  return {
    id: AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID,
    name: "Agent OS Software Project",
    modules: ["repo", "docs", "work", "workflow", "automations", "reports"],
    projectTree: [
      { name: "Product", slug: "product", kind: "project" },
      { name: "Agent Workflows", slug: "agent-workflows", kind: "subproject" },
    ],
    docs: [
      { title: "Spec", kind: "spec" },
      { title: "ADR", kind: "adr" },
      { title: "Runbook", kind: "runbook" },
      { title: "Handoff", kind: "handoff" },
    ],
    workItems: [
      { title: "Implement first vertical workflow", kind: "epic" },
      { title: "Verify project setup parity", kind: "task" },
    ],
    policies: {
      contextSource: "project",
      trustMode: "manual" satisfies TemplateTrustMode,
      runDispatch: "preview-required",
    },
    automations: [{ id: "repo-health", trigger: "repo.linked", action: "repo.status" }],
    reports: [{ id: "workflow-status", name: "Workflow status" }],
    effects: [{ id: "repo-health-check", kind: "command", command: "git status", destructive: false }],
  };
}

function parseMarkdownTemplate(source: string): RawTemplateSource {
  const match = /^---\n([\s\S]*?)\n---/.exec(source);
  if (!match) throw new Error("FULCRUM_TEMPLATE.md must start with YAML frontmatter");
  return TemplateSourceSchema.parse(parseYaml(match[1] ?? ""));
}

function labelFromId(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
