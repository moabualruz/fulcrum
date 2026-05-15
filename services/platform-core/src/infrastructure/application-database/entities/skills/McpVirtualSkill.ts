/**
 * McpVirtualSkill entity — MCP virtual skill descriptors (D-17, D-18, D-19).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
} from "typeorm";

@Entity("mcp_virtual_skills")
@Unique("mcp_virtual_skills_slug", ["slug"])
export class McpVirtualSkill {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  slug!: string;

  @Column({ type: "varchar", name: "server_name" })
  serverName!: string;

  @Column({ type: "varchar", name: "command_or_url" })
  commandOrUrl!: string;

  @Column({ type: "varchar", name: "package_name", nullable: true })
  packageName?: string;

  @Column({ type: "varchar", nullable: true })
  version?: string;

  @Column({ type: "jsonb", name: "env_hints_json", nullable: true })
  envHintsJson?: Record<string, string>;

  @Column({ type: "jsonb", name: "tool_names_json" })
  toolNamesJson: string[] = [];

  @Column({ type: "varchar", name: "descriptor_sha256" })
  descriptorSha256!: string;

  @Column({ type: "varchar", name: "tool_manifest_hash", nullable: true })
  toolManifestHash?: string;

  @Column({ type: "varchar" })
  source: string = "mcp";

  @Column({ type: "boolean", name: "invokable_by_fulcrum" })
  invokableByFulcrum: boolean = false;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;

  @Column({ type: "varchar", nullable: true })
  description?: string;

  @Column({ type: "varchar", nullable: true })
  vendor?: string;
}
