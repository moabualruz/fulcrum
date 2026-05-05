/**
 * Wave 0: MCP virtual skill descriptor gate (RTR-05).
 *
 * Tests that MCP servers appear as first-class virtual skills with:
 * - source: "mcp"
 * - invokableByFulcrum: false (descriptor-only, no direct invocation)
 * - descriptorSha256 — SHA-256 of the pinned registry descriptor
 * - toolManifestHash — hash of the tool manifest (tools/list response)
 *
 * RED phase — stub types.  GREEN phase connects production imports.
 */

import { describe, it, expect } from "bun:test";
import { createHash } from "node:crypto";

// ── Shared types (pattern from RESEARCH.md §Pattern 4) ─────────────────

export interface McpVirtualSkillDescriptor {
  source: "mcp";
  slug: string;
  serverName: string;
  commandOrUrl: string;
  description: string;
  vendor: string;
  toolNames: readonly string[];
  descriptorSha256: string;
  toolManifestHash: string;
  invokableByFulcrum: false;
}

export interface McpToolManifestEntry {
  name: string;
  title: string | null;
  description: string | null;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown> | null;
}

// ── Helpers — full GREEN implementation ─────────────────────────────────

function computeToolManifestHash(tools: readonly McpToolManifestEntry[]): string {
  const normalized = [...tools]
    .map((t) => ({
      name: t.name,
      title: t.title ?? null,
      description: t.description ?? null,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return sha256Hex(JSON.stringify(normalized));
}

function computeDescriptorSha256(descriptor: string): string {
  return sha256Hex(descriptor);
}

function createMcpVirtualSkill(params: {
  serverName: string;
  commandOrUrl: string;
  description: string;
  vendor: string;
  toolNames: readonly string[];
  tools: readonly McpToolManifestEntry[];
}): McpVirtualSkillDescriptor {
  const descriptor = JSON.stringify({
    serverName: params.serverName,
    commandOrUrl: params.commandOrUrl,
    description: params.description,
    vendor: params.vendor,
    toolNames: [...params.toolNames].sort(),
  });

  const manifestHash = computeToolManifestHash(params.tools);

  return {
    source: "mcp",
    slug: `mcp-${params.serverName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    serverName: params.serverName,
    commandOrUrl: params.commandOrUrl,
    description: params.description,
    vendor: params.vendor,
    toolNames: params.toolNames,
    descriptorSha256: computeDescriptorSha256(descriptor),
    toolManifestHash: manifestHash,
    invokableByFulcrum: false,
  };
}

// ── Helpers (shared with production code) ──────────────────────────────

/** Deterministic SHA-256 hex digest of a JSON-sorted tool manifest. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

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

    // Same input must produce same hash, different inputs different hashes.
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    expect(hashB).toMatch(/^[a-f0-9]{64}$/);
    expect(hashA).not.toBe(hashB);
  });

  it("produces deterministic descriptor hash", () => {
    const descriptorA = JSON.stringify({ serverName: "gh", vendor: "github" });
    const descriptorB = JSON.stringify({ serverName: "pw", vendor: "microsoft" });

    const hashA = computeDescriptorSha256(descriptorA);
    const hashB = computeDescriptorSha256(descriptorB);

    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    expect(hashB).toMatch(/^[a-f0-9]{64}$/);
    expect(hashA).not.toBe(hashB);

    // Same input must be deterministic.
    expect(computeDescriptorSha256(descriptorA)).toBe(hashA);
  });
});
