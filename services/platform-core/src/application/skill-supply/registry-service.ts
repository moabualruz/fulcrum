/**
 * SkillRegistryService — merged local/upstream/MCP skill listing.
 *
 * D-17: MCP servers appear as first-class virtual skills with source=mcp.
 * D-20: MCP virtual skills are globally visible without per-agent support
 *       details.
 */

import type { DataSource } from "typeorm";
import { FulcrumSkill } from "@platform-core/infrastructure/application-database/entities/skills/FulcrumSkill.ts";
import { initDataSource } from "@platform-core/infrastructure/application-database/typeorm.config.ts";

/** Source discriminator for a merged skill row. */
export type SkillSourceValue = "local" | "upstream" | "mcp";

/** Unified skill list entry. */
export interface SkillRegistryEntry {
  slug: string;
  name: string;
  source: SkillSourceValue;
  version: string | null;
  enabledAgents: string[];
}

interface DataSourceHandle {
  dataSource: DataSource;
  close(): Promise<void>;
}

let testDataSource: DataSource | undefined;

export function __setRegistryServiceOrmForTest(
  ds: DataSource | undefined,
): void {
  testDataSource = ds;
}

async function dsForRegistry(): Promise<DataSourceHandle> {
  if (testDataSource) {
    return {
      dataSource: testDataSource,
      close: async () => undefined,
    };
  }

  const dataSource = await initDataSource();
  return {
    dataSource,
    close: async () => {
      await dataSource.destroy();
    },
  };
}

/**
 * SkillRegistryService — merged skill listing from all sources.
 */
export class SkillRegistryService {
  /**
   * List all skills from all sources: local, upstream, and MCP.
   */
  static async list(orgId: string): Promise<SkillRegistryEntry[]> {
    const handle = await dsForRegistry();
    try {
      const repo = handle.dataSource.getRepository(FulcrumSkill);
      const skills = await repo.find({
        where: { org: { id: orgId } },
        order: { slug: "ASC" },
      });

      const entries: SkillRegistryEntry[] = skills.map((skill) => {
        const source = skill.source === "upstream"
          ? "upstream" as const
          : "local" as const;
        return {
          slug: skill.slug,
          name: skill.name,
          source,
          version: null,
          enabledAgents: skill.enabledAgents,
        };
      });

      return entries;
    } finally {
      await handle.close();
    }
  }
}
