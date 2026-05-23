import { describe, expect, test } from "bun:test";
import { access } from "node:fs/promises";

import { GENERATED_DOMAIN_COMMANDS } from "@fulcrum/cli/generated-domains.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import {
  REQUIRED_INTERFACE_ACTIONS,
  REQUIRED_SURFACE_DOMAINS,
  listInterfaceActionParityGaps,
  listMissingApiDomains,
  listMissingCliDomains,
  listMissingTuiDomains,
  listMissingWebRoutes,
} from "./surface-domain-matrix.ts";

const REQUIRED_CORE_DOMAINS = [
  "projects",
  "tasks",
  "docs",
  "memory",
  "runs",
  "repos",
  "artifacts",
  "search",
  "notifications",
  "reports",
  "planning",
  "review",
  "settings",
] as const;

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("surface domain parity matrix", () => {
  test("includes every required surface core domain", () => {
    const names = REQUIRED_SURFACE_DOMAINS.map((domain) => domain.name);

    for (const domain of REQUIRED_CORE_DOMAINS) {
      expect(names).toContain(domain);
    }
  });

  test("maps required domains to canonical appRouter or compatibility aliases", () => {
    const routerKeys = new Set(Object.keys(appRouter));

    expect(routerKeys.has("tasks")).toBe(true);
    expect(routerKeys.has("docs")).toBe(true);
    expect(routerKeys.has("memories")).toBe(true);
    expect(routerKeys.has("agent_runs")).toBe(true);
    expect(routerKeys.has("repos")).toBe(true);
    expect(routerKeys.has("artifacts")).toBe(true);
    expect(routerKeys.has("search")).toBe(true);
    expect(routerKeys.has("notify")).toBe(true);
  });

  test("reports missing CLI domains from generated and top-level command inventory", () => {
    const topLevelCommandAliases = ["product", "settings", "component", "components"];

    expect(listMissingCliDomains([...GENERATED_DOMAIN_COMMANDS, ...topLevelCommandAliases])).toEqual([]);
  });

  test("reports missing TUI labels from navigation inventory", () => {
    const labels = ["Tasks", "Docs", "Memory", "Artifacts", "Inference", "Routing Rules"];

    expect(listMissingTuiDomains(labels)).toEqual([
      "projects",
      "sprints",
      "runs",
      "repos",
      "search",
      "notifications",
      "reports",
      "planning",
      "review",
      "skills",
      "components",
      "doctor",
      "settings",
      "auth",
    ]);
  });

  test("reports missing API domains from route registrations", () => {
    const routes = [
      "tasks",
      "sprints",
      "docs",
      "memory",
      "runs",
      "repos",
      "artifacts",
      "search",
      "notifications",
      "projects",
      "reports",
      "planning",
      "review",
      "settings",
    ];

    expect(listMissingApiDomains(routes)).toEqual([]);
  });

  test("reports missing Web routes from SvelteKit route inventory", async () => {
    const routesRoot = new URL("../../../../../apps/web/src/routes/", import.meta.url).pathname;
    const candidates = [
      "projects/+page.svelte",
      "projects/[id]/sprints/+page.svelte",
      "tasks/[id]/+page.svelte",
      "docs/+page.svelte",
      "memory/+page.svelte",
      "runs/+page.svelte",
      "repos/+page.svelte",
      "artifacts/+page.svelte",
      "search/+page.svelte",
      "inbox/+page.svelte",
      "settings/skills/+page.svelte",
      "settings/routing/+page.svelte",
      "settings/inference/+page.svelte",
      "doctor/+page.svelte",
      "auth/login/+page.svelte",
      "projects/[id]/updates/+page.svelte",
      "projects/[id]/planning/materialize/+page.svelte",
      "projects/[id]/review/+page.svelte",
      "settings/notifications/+page.svelte",
    ];
    const existing = [];

    for (const candidate of candidates) {
      if (await pathExists(`${routesRoot}${candidate}`)) existing.push(candidate);
    }

    expect(listMissingWebRoutes(existing)).toEqual([]);
  });

  test("defines command/control workflows for the PRD parity domains", () => {
    const expected = ["projects", "tasks", "docs", "repos", "artifacts", "notifications", "runs", "reports", "planning", "review", "settings"];

    for (const name of expected) {
      const domain = REQUIRED_SURFACE_DOMAINS.find((candidate) => candidate.name === name);
      expect(domain, `${name} domain missing`).toBeDefined();
      expect(domain!.workflows.length, `${name} needs at least one workflow mapping`).toBeGreaterThan(0);

      for (const workflow of domain!.workflows) {
        expect(workflow.cli.length, `${name}:${workflow.name} needs CLI mapping`).toBeGreaterThan(0);
        expect(workflow.tui.length, `${name}:${workflow.name} needs TUI mapping`).toBeGreaterThan(0);
        expect(workflow.api.length, `${name}:${workflow.name} needs API mapping`).toBeGreaterThan(0);
        expect(workflow.stateShape.length, `${name}:${workflow.name} needs state shape`).toBeGreaterThan(0);
        expect(workflow.manualScript.length, `${name}:${workflow.name} needs manual script`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test("defines Web actions with API, CLI, and TUI parity", async () => {
    const routesRoot = new URL("../../../../../apps/web/src/routes/", import.meta.url).pathname;
    const routeGaps: string[] = [];
    const domains = new Set(REQUIRED_SURFACE_DOMAINS.map((domain) => domain.name));
    const actionNames = new Set<string>();

    expect(listInterfaceActionParityGaps()).toEqual([]);

    for (const action of REQUIRED_INTERFACE_ACTIONS) {
      actionNames.add(`${action.domain}:${action.name}`);
      expect(domains.has(action.domain), `${action.domain}:${action.name} domain missing`).toBe(true);
      expect(action.kind, `${action.domain}:${action.name} invalid kind`).toMatch(/^(create|read|update|delete|workflow)$/);
      expect(action.apiRoute, `${action.domain}:${action.name} must point to appRouter`).toMatch(/^appRouter\./);
      expect(action.stateShape, `${action.domain}:${action.name} must expose stable state`).toEqual(expect.arrayContaining(["traceId"]));
      expect(action.manualScript, `${action.domain}:${action.name} must compare all surfaces`).toHaveLength(4);
      if (!(await pathExists(`${routesRoot}${action.webRoute}`))) routeGaps.push(`${action.domain}:${action.name}:${action.webRoute}`);
    }

    expect(actionNames.size).toBe(REQUIRED_INTERFACE_ACTIONS.length);
    expect(routeGaps).toEqual([]);
  });

  test("records known parity gaps as first-class matrix data", () => {
    const gaps = REQUIRED_SURFACE_DOMAINS.flatMap((domain) => domain.gaps.map((gap) => `${domain.name}:${gap.id}:${gap.surface}`));

    expect(gaps).toEqual(expect.arrayContaining([
      "docs:docs:tui-display-only-list:tui",
      "reports:reports:tui-command-gap:tui",
      "review:review:tui-display-gap:tui",
    ]));
  });
});
