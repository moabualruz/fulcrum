import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

const script = join(process.cwd(), "scripts/check-ui-kit-first.ts");
const tempRoots: string[] = [];

function makeFixtureRoot(source: string, routePath = "settings/Filters.svelte"): string {
  const root = mkdtempSync(join(tmpdir(), "fulcrum-ui-kit-first-"));
  tempRoots.push(root);
  const routeDir = join(root, "apps/web/src/routes", routePath.split("/").slice(0, -1).join("/"));
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, routePath.split("/").at(-1) ?? "Filters.svelte"), source);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("check-ui-kit-first", () => {
  test("flags route-local native select wrappers that do not compose ui-kit Select", () => {
    const root = makeFixtureRoot(`
      <script lang="ts">
        let value = "open";
      </script>

      <label class="flex items-center gap-2 text-xs">
        Status
        <select bind:value={value} class="rounded-md border border-border bg-background px-2 py-1">
          <option value="open">Open</option>
          <option value="done">Done</option>
        </select>
      </label>
    `);

    const result = Bun.spawnSync(["bun", script], {
      env: { ...process.env, UI_KIT_FIRST_ROOT: root },
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
    expect(result.exitCode).toBe(1);
    expect(output).toContain("apps/web/src/routes/settings/Filters.svelte");
    expect(output).toContain("native-select-reimplementation");
    expect(output).toContain("Select");
  });

  test("flags native select responsibility at legacy allowlisted production paths", () => {
    const root = makeFixtureRoot(
      `
      <script lang="ts">
        import {
          Badge,
          Button,
          Card,
          Input,
          Switch,
          Tabs,
          TabsList,
          TabsTrigger,
          Textarea,
        } from "@fulcrum/ui-kit";

        let value = "push";
      </script>

      <select bind:value={value} aria-label="Delivery channel">
        <option value="push">Push</option>
        <option value="email">Email</option>
      </select>
    `,
      "settings/routing/RoutingPage.svelte",
    );

    const result = Bun.spawnSync(["bun", script], {
      env: { ...process.env, UI_KIT_FIRST_ROOT: root },
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
    expect(result.exitCode).toBe(1);
    expect(output).toContain("apps/web/src/routes/settings/routing/RoutingPage.svelte");
    expect(output).toContain("native-select-reimplementation");
  });
});
