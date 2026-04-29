import { describe, expect, test } from "bun:test";
import { ALL_COMPONENTS, HOOKS, MCP_COMPONENTS, getComponent, expandProfile } from "./catalog.ts";

function component(id: string) {
  const found = getComponent(id);
  expect(found).not.toBeNull();
  return found!;
}

describe("component catalog", () => {
  test("contains stable component ids for current Fulcrum managed surfaces", () => {
    const ids = ALL_COMPONENTS.map((c) => c.id).sort();
    expect(ids).toContain("profile.default");
    expect(ids).toContain("rules.global");
    expect(ids).toContain("policy.tool-output");
    expect(ids).toContain("hooks.format");
    expect(ids).toContain("skills.authored");
    expect(ids).toContain("skills.upstream");
    expect(ids).toContain("package.caveman");
    expect(ids).toContain("package.repomix");
    expect(ids).toContain("package.cloudflare");
    expect(ids).toContain("package.superpowers");
    expect(ids).toContain("mcp.deepwiki");
    expect(ids).toContain("mcp.registry");
    expect(ids).toContain("mcp.context7");
  });

  test("component ids are unique", () => {
    const ids = ALL_COMPONENTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("surface component ids match parent component ids", () => {
    for (const component of ALL_COMPONENTS) {
      for (const surface of component.surfaces) {
        expect(surface.componentId).toBe(component.id);
      }
    }
  });

  test("surface ids are unique across all components", () => {
    const surfaceIds = ALL_COMPONENTS.flatMap((component) =>
      component.surfaces.map((surface) => surface.id),
    );
    expect(new Set(surfaceIds).size).toBe(surfaceIds.length);
  });

  test("profile members resolve to catalog components", () => {
    for (const component of ALL_COMPONENTS) {
      if (component.kind !== "profile") continue;
      for (const memberId of component.profileMembers ?? []) {
        expect(getComponent(memberId)).not.toBeNull();
      }
    }
  });

  test("defaultProfile only marks installed components, not profiles", () => {
    for (const component of ALL_COMPONENTS) {
      if (component.kind === "profile") {
        expect(component.defaultProfile).toBeUndefined();
      }
    }
  });

  test("defaultProfile exactly marks non-profile components in profile.default", () => {
    const defaultIds = expandProfile("profile.default").map((c) => c.id);
    const defaultIdSet = new Set(defaultIds);

    for (const component of ALL_COMPONENTS) {
      if (component.kind === "profile") continue;
      expect(component.defaultProfile === true).toBe(defaultIdSet.has(component.id));
    }
  });

  test("generated MCP defaultProfile follows profile.default membership", () => {
    expect(getComponent("mcp.repomix")?.defaultProfile).toBeUndefined();
    expect(getComponent("mcp.context7")?.defaultProfile).toBe(true);
  });

  test("hook catalog uses stable install order", () => {
    expect(HOOKS).toEqual([
      "format",
      "lint-gate",
      "pm-policy",
      "test-on-edit",
      "audit-log",
      "index-check",
      "index-rebuild",
      "tool-output-router",
    ]);
  });

  test("profile.default expands in install order", () => {
    expect(expandProfile("profile.default").map((c) => c.id)).toEqual([
      "policy.tool-output",
      "rules.global",
      "package.caveman",
      "skills.authored",
      "skills.upstream",
      "package.cloudflare",
      "package.superpowers",
      "mcp.deepwiki",
      "mcp.registry",
      "mcp.context7",
    ]);
  });

  test("profile.verify-all expands default plus generated MCP components", () => {
    const defaultIds = expandProfile("profile.default").map((c) => c.id);
    const defaultIdSet = new Set(defaultIds);
    const generatedMcpIds = MCP_COMPONENTS
      .map((c) => c.id)
      .filter((id) => !defaultIdSet.has(id));

    expect(expandProfile("profile.verify-all").map((c) => c.id)).toEqual([
      ...defaultIds,
      ...generatedMcpIds,
    ]);
  });

  test("profile.minimal expands in install order", () => {
    expect(expandProfile("profile.minimal").map((c) => c.id)).toEqual([
      "policy.tool-output",
      "rules.global",
      "mcp.deepwiki",
      "mcp.context7",
    ]);
  });

  test("non-profile and unknown ids expand to empty lists", () => {
    expect(expandProfile("package.caveman")).toEqual([]);
    expect(expandProfile("missing.component")).toEqual([]);
  });

  test("unknown component returns null", () => {
    expect(getComponent("missing.component")).toBeNull();
  });

  test("hook surfaces match registration contract", () => {
    expect(component("hooks.format").surfaces).toEqual([
      {
        id: "hooks.format:registration",
        componentId: "hooks.format",
        kind: "hook-registration",
        target: "hook:format",
        ownerKey: "fulcrum:hook:format",
        removePolicy: "managed-only",
        supportsDisable: true,
        payload: { recipe: "format" },
      },
    ]);
  });

  test("generated MCP components expose one registry surface", () => {
    expect(component("mcp.context7").surfaces).toEqual([
      {
        id: "mcp.context7:registry",
        kind: "mcp-registry-entry",
        componentId: "mcp.context7",
        target: "mcp:context7",
        ownerKey: "fulcrum:mcp:context7",
        removePolicy: "managed-only",
        supportsDisable: true,
        payload: { name: "context7" },
      },
    ]);
  });

  test("core file and sentinel surfaces match ownership contracts", () => {
    expect(component("policy.tool-output").surfaces).toEqual([
      {
        id: "policy.tool-output:file",
        kind: "policy-seed",
        componentId: "policy.tool-output",
        target: "~/.fulcrum/tool-output-policy.toml",
        ownerKey: "fulcrum:policy:tool-output",
        removePolicy: "keep-modified",
      },
    ]);

    expect(component("rules.global").surfaces).toEqual([
      {
        id: "rules.global:sentinel",
        kind: "sentinel-block",
        componentId: "rules.global",
        target: "agent-rules-files",
        ownerKey: "FULCRUM RULES",
        removePolicy: "sentinel-only",
      },
    ]);
  });

  test("skill surfaces match sync ownership contracts", () => {
    expect(component("skills.authored").surfaces).toEqual([
      {
        id: "skills.authored:sync",
        kind: "skill-sync",
        componentId: "skills.authored",
        target: "agent-skill-roots",
        ownerKey: "fulcrum:skills:authored",
        removePolicy: "managed-only",
      },
    ]);

    expect(component("skills.upstream").surfaces).toEqual([
      {
        id: "skills.upstream:sync",
        kind: "upstream-skill-sync",
        componentId: "skills.upstream",
        target: "vendor-skill-roots",
        ownerKey: "fulcrum:skills:upstream",
        removePolicy: "managed-only",
      },
    ]);
  });

  test("package surfaces match install ownership contracts", () => {
    expect(component("package.caveman").surfaces).toEqual([
      {
        id: "package.caveman:install",
        kind: "vendor-command",
        componentId: "package.caveman",
        target: "agent-caveman-surfaces",
        ownerKey: "fulcrum:package:caveman",
        removePolicy: "purgeable",
        payload: { name: "caveman" },
      },
    ]);

    expect(component("package.repomix").surfaces).toEqual([
      {
        id: "package.repomix:install",
        kind: "vendor-command",
        componentId: "package.repomix",
        target: "agent-repomix-surfaces",
        ownerKey: "fulcrum:package:repomix",
        removePolicy: "managed-only",
        payload: { name: "repomix" },
      },
    ]);
  });

  test("managed MCP support components match registry contracts", () => {
    expect(component("mcp.deepwiki")).toMatchObject({ defaultProfile: true });
    expect(component("mcp.deepwiki").surfaces).toEqual([
      {
        id: "mcp.deepwiki:registration",
        kind: "mcp-agent-config",
        componentId: "mcp.deepwiki",
        target: "mcp:deepwiki",
        ownerKey: "fulcrum:mcp:deepwiki",
        removePolicy: "managed-only",
        supportsDisable: true,
      },
    ]);

    expect(component("mcp.registry")).toMatchObject({ defaultProfile: true });
    expect(component("mcp.registry").surfaces).toEqual([
      {
        id: "mcp.registry:entries",
        kind: "mcp-registry-entry",
        componentId: "mcp.registry",
        target: "~/.fulcrum/state/global/mcp-registry.toml",
        ownerKey: "fulcrum:mcp:registry",
        removePolicy: "managed-only",
      },
    ]);
  });
});
