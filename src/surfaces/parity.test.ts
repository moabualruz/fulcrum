import { describe, expect, test } from "bun:test";
import { access } from "node:fs/promises";

import { GENERATED_DOMAIN_COMMANDS } from "@fulcrum/cli/generated-domains.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import {
  REQUIRED_SURFACE_DOMAINS,
  listMissingApiDomains,
  listMissingCliDomains,
  listMissingTuiDomains,
  listMissingWebRoutes,
} from "./parity.ts";

const REQUIRED_CORE_DOMAINS = [
  "tasks",
  "docs",
  "memory",
  "runs",
  "repos",
  "artifacts",
  "search",
  "notifications",
] as const;

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("Phase 08 surface parity matrix", () => {
  test("includes every required Phase 08 core domain", () => {
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

  test("reports missing CLI domains from generated command inventory", () => {
    expect(listMissingCliDomains(GENERATED_DOMAIN_COMMANDS)).toEqual(["components"]);
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
      "skills",
      "components",
      "doctor",
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
    ];

    expect(listMissingApiDomains(routes)).toEqual([]);
  });

  test("reports missing Web routes from SvelteKit route inventory", async () => {
    const routesRoot = new URL("../web/src/routes/", import.meta.url).pathname;
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
    ];
    const existing = [];

    for (const candidate of candidates) {
      if (await pathExists(`${routesRoot}${candidate}`)) existing.push(candidate);
    }

    expect(listMissingWebRoutes(existing)).toEqual([]);
  });
});
