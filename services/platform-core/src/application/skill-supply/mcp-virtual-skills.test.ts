/**
 * MCP virtual skill descriptor gate (RTR-05).
 *
 * Tests that MCP servers appear as first-class virtual skills with:
 * - source: "mcp"
 * - invokableByFulcrum: false (descriptor-only, no direct invocation)
 * - descriptorSha256 — SHA-256 of the pinned registry descriptor
 * - toolManifestHash — hash of the tool manifest (tools/list response)
 *
 */

import { describe, it, expect } from "bun:test";

// ── RED: imports from production modules that do not yet exist ─────────
import {
  type McpVirtualSkillDescriptor,
  type McpToolManifestEntry,
  computeToolManifestHash,
  computeDescriptorSha256,
  createMcpVirtualSkill,
} from "./mcp-virtual-skills.ts";

// ── Tests ──────────────────────────────────────────────────────────────

describe("MCP virtual skills - descriptor shape (RTR-05)", () => {
  it("creates descriptor with source=mcp and invokableByFulcrum=false", () => {
    const skill = createMcpVirtualSkill({
      serverName: "github",
      commandOrUrl: "https://api.githubcopilot.com/mcp/",
      description: "Official GitHub MCP server",
      vendor: "github",
      toolNames: ["list_issues", "create_pr", "search_code"],
      tools: [
        { name: "list_issues", title: null, description: "List repository issues", inputSchema: {}, outputSchema: null },
        { name: "create_pr", title: null, description: "Create a pull request", inputSchema: { type: "object" }, outputSchema: null },
        { name: "search_code", title: null, description: "Search across repositories", inputSchema: { type: "object" }, outputSchema: null },
      ],
    });

    expect(skill.source).toBe("mcp");
    expect(skill.invokableByFulcrum).toBe(false);
    expect(skill.slug).toBeDefined();
    expect(skill.serverName).toBe("github");
    expect(skill.descriptorSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(skill.toolManifestHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("includes pinned descriptor metadata", () => {
    const skill = createMcpVirtualSkill({
      serverName: "playwright",
      commandOrUrl: "npx -y @playwright/mcp@latest",
      description: "Playwright MCP server — browser automation",
      vendor: "microsoft",
      toolNames: ["navigate", "click", "type", "screenshot"],
      tools: [
        { name: "navigate", title: null, description: "Navigate to URL", inputSchema: { properties: { url: { type: "string" } } }, outputSchema: null },
        { name: "click", title: null, description: "Click element", inputSchema: { properties: { selector: { type: "string" } } }, outputSchema: null },
        { name: "type", title: null, description: "Type text", inputSchema: { properties: { text: { type: "string" } } }, outputSchema: null },
        { name: "screenshot", title: null, description: "Take screenshot", inputSchema: { properties: { fullPage: { type: "boolean" } } }, outputSchema: null },
      ],
    });

    expect(skill.source).toBe("mcp");
    expect(skill.vendor).toBe("microsoft");
    expect(skill.commandOrUrl).toContain("@playwright/mcp");
    expect(skill.toolNames).toContain("navigate");
    expect(skill.toolNames).toContain("screenshot");
    expect(skill.descriptorSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(skill.toolManifestHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces deterministic tool manifest hash", () => {
    const toolsA: readonly McpToolManifestEntry[] = [
      { name: "a", title: null, description: "tool a", inputSchema: {}, outputSchema: null },
      { name: "b", title: null, description: "tool b", inputSchema: {}, outputSchema: null },
    ];
    const toolsB: readonly McpToolManifestEntry[] = [
      { name: "a", title: null, description: "tool a", inputSchema: {}, outputSchema: null },
    ];

    const hashA = computeToolManifestHash(toolsA);
    const hashB = computeToolManifestHash(toolsB);

    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    expect(hashB).toMatch(/^[a-f0-9]{64}$/);
    expect(hashA).not.toBe(hashB);
  });

  it("produces deterministic descriptor hash", () => {
    const hashA = computeDescriptorSha256(JSON.stringify({ serverName: "gh", vendor: "github" }));
    const hashB = computeDescriptorSha256(JSON.stringify({ serverName: "pw", vendor: "microsoft" }));

    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    expect(hashB).toMatch(/^[a-f0-9]{64}$/);
    expect(hashA).not.toBe(hashB);
    expect(computeDescriptorSha256(JSON.stringify({ serverName: "gh", vendor: "github" }))).toBe(hashA);
  });
});
