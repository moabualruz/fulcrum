import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { TRPC_ACTIONS, TRPC_RESOURCES } from "@fulcrum/server/trpc/permissions.ts";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

type PermissionUsage = {
  file: string;
  resource: string;
  action: string;
};

function collectRouterFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return collectRouterFiles(file);
    return entry.isFile() && file.endsWith(".ts") ? [file] : [];
  });
}

function permissionUsages(): PermissionUsage[] {
  const routerDir = join(repoRoot, "apps/server/src/trpc/routers");
  return collectRouterFiles(routerDir).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(/permissionedProcedure\(\{\s*resource:\s*"([^"]+)",\s*action:\s*"([^"]+)"/g)]
      .map((match) => ({
        file: relative(repoRoot, file),
        resource: match[1]!,
        action: match[2]!,
      }));
  });
}

describe("tRPC permission registry", () => {
  test("all permissioned procedures use registered resources and actions", () => {
    const resources = new Set<string>(Object.values(TRPC_RESOURCES));
    const actions = new Set<string>(Object.values(TRPC_ACTIONS));

    const unknown = permissionUsages()
      .flatMap((usage) => [
        resources.has(usage.resource) ? null : `${usage.file}:resource:${usage.resource}`,
        actions.has(usage.action) ? null : `${usage.file}:action:${usage.action}`,
      ])
      .filter((value): value is string => value !== null);

    expect(unknown).toEqual([]);
  });
});
