/**
 * McpVirtualSkill entity — MCP virtual skill descriptors (D-17, D-18, D-19).
 *
 * Stores MCP server descriptors as globally visible virtual skill rows with
 * source fixed to `mcp` and invokableByFulcrum fixed to false.
 *
 * Per-agent support fields are intentionally absent per D-20.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";

@Entity({ tableName: "mcp_virtual_skills" })
@Unique({ name: "mcp_virtual_skills_slug", properties: ["slug"] })
export class McpVirtualSkill {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "string" })
  slug!: string;

  @Property({ type: "string", fieldName: "server_name" })
  serverName!: string;

  @Property({ type: "string", fieldName: "command_or_url" })
  commandOrUrl!: string;

  @Property({ type: "string", fieldName: "package_name", nullable: true })
  packageName?: string;

  @Property({ type: "string", nullable: true })
  version?: string;

  @Property({ type: "json", fieldName: "env_hints_json", nullable: true })
  envHintsJson?: Record<string, string>;

  @Property({ type: "json", fieldName: "tool_names_json" })
  toolNamesJson: string[] = [];

  @Property({ type: "string", fieldName: "descriptor_sha256" })
  descriptorSha256!: string;

  @Property({ type: "string", fieldName: "tool_manifest_hash", nullable: true })
  toolManifestHash?: string;

  @Property({ type: "string" })
  source: string = "mcp";

  @Property({ type: "boolean", fieldName: "invokable_by_fulcrum" })
  invokableByFulcrum: boolean = false;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;

  @Property({ type: "string", nullable: true })
  description?: string;

  @Property({ type: "string", nullable: true })
  vendor?: string;
}
