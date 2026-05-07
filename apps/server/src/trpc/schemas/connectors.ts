/**
 * Zod schemas for the connectors domain.
 * Pillar 13 (connector framework) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Connector protocol — how the connector communicates. */
export const ConnectorProtocolSchema = z.enum(["mcp", "http", "grpc", "stdio"]);

/** Connector status. */
export const ConnectorStatusSchema = z.enum(["active", "disabled", "error", "pending"]);

/** Input for registering or updating a connector. */
export const ConnectorInput = z.object({
  orgId: z.string().uuid().describe("Organisation that owns this connector."),
  name: z.string().min(1).describe("Human-readable connector name."),
  protocol: ConnectorProtocolSchema.describe("Transport protocol used to communicate with the connector."),
  endpoint: z.string().url().describe("URL or address for the connector endpoint."),
  description: z.string().describe("What this connector provides — used for discovery and CLI help."),
});

/** Minimal Connector output schema — Pillar 13 extends with health, metrics, and auth fields. */
export const ConnectorOutput = z.object({
  id: z.string().uuid().describe("Unique connector identifier."),
  orgId: z.string().uuid().describe("Organisation that owns this connector."),
  name: z.string().describe("Human-readable connector name."),
  protocol: ConnectorProtocolSchema.describe("Transport protocol used to communicate with the connector."),
  endpoint: z.string().url().describe("URL or address for the connector endpoint."),
  status: ConnectorStatusSchema.describe("Current health status of the connector."),
  createdAt: z.date().describe("Timestamp when the connector was registered."),
});

/** Input for listing connectors. */
export const ListConnectorsInput = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation."),
  protocol: ConnectorProtocolSchema.optional().describe("Filter by protocol type."),
  status: ConnectorStatusSchema.optional().describe("Filter by health status."),
});

export type ConnectorInputType = z.infer<typeof ConnectorInput>;
export type ConnectorOutputType = z.infer<typeof ConnectorOutput>;
export type ConnectorProtocol = z.infer<typeof ConnectorProtocolSchema>;
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;
export type ListConnectorsInputType = z.infer<typeof ListConnectorsInput>;
