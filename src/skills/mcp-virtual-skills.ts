/**
 * MCP virtual skill descriptor mapping.
 *
 * Maps MCP server descriptors to searchable virtual skill rows with
 * source=mcp, invokableByFulcrum=false, and SHA-256 hashes for pinned
 * descriptors and tool manifests.
 *
 * D-17: MCP servers appear as first-class virtual skills with source=mcp.
 * D-18: Virtual MCP skills are discoverable descriptors only.
 * D-19: Pinned by server name, command/package/version/env hints,
 *       descriptor hash, and tool manifest hash.
 * D-20: Globally visible without per-agent support details.
 */

import { createHash } from "node:crypto";
import { BUILTIN_MCPS } from "../cli/mcp-builtins.ts";

// ── Shared types ───────────────────────────────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────────────────────

/** Deterministic SHA-256 hex digest. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Compute a deterministic SHA-256 hash of the tool manifest.
 * Tool entries are sorted by name before hashing.
 */
export function computeToolManifestHash(
  tools: readonly McpToolManifestEntry[],
): string {
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

/** Compute a deterministic SHA-256 hash of a raw descriptor string. */
export function computeDescriptorSha256(descriptor: string): string {
  return sha256Hex(descriptor);
}

/**
 * Create an McpVirtualSkillDescriptor from MCP server parameters.
 * Used by buildMcpVirtualSkillDescriptors() and by tests.
 */
export function createMcpVirtualSkill(params: {
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

/**
 * Build MCP virtual skill descriptors from the built-in MCP catalog.
 *
 * Reads from the canonical BUILTIN_MCPS list and returns descriptor
 * rows with "MCP virtual" as the display label.
 *
 * Tool manifest hashes are computed from empty tool arrays —
 * actual tool manifest harvesting requires live MCP listTools calls
 * (requires @modelcontextprotocol/sdk).
 */
export function buildMcpVirtualSkillDescriptors(): McpVirtualSkillDescriptor[] {
  return BUILTIN_MCPS.map((entry) => {
    const spec = entry.spec;
    const commandOrUrl = spec.url ?? spec.command ?? "";
    return createMcpVirtualSkill({
      serverName: entry.name,
      commandOrUrl,
      description: spec.description,
      vendor: spec.vendor,
      toolNames: [],
      tools: [],
    });
  });
}
