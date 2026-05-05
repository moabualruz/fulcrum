/**
 * SkillRegistryService — merged local/upstream/MCP skill listing.
 *
 * D-17: MCP servers appear as first-class virtual skills with source=mcp.
 * D-20: MCP virtual skills are globally visible without per-agent support
 *       details.
 */

import type { MikroORM } from "@mikro-orm/postgresql";
import { FulcrumSkill } from "../db/entities/skills/FulcrumSkill.ts";
import { initOrm } from "../db/mikro-orm.config.ts";

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

interface OrmHandle {
  orm: MikroORM;
  close(): Promise<void>;
}

let testOrm: MikroORM | undefined;

export function __setRegistryServiceOrmForTest(
  orm: MikroORM | undefined,
): void {
  testOrm = orm;
}

async function ormForRegistry(): Promise<OrmHandle> {
  if (testOrm) {
    return {
      orm: testOrm,
      close: async () => undefined,
    };
  }

  const orm = await initOrm();
  return {
    orm,
    close: async () => {
      await orm.close(true);
    },
  };
}

/**
 * SkillRegistryService — merged skill listing from all sources.
 *
 * Currently queries FulcrumSkill (local/upstream/package) from the database.
 * MCP virtual skill integration will be added in a follow-up plan that
 * wires the McpVirtualSkill entity and buildMcpVirtualSkillDescriptors()
 * into the merged output.
 */
export class SkillRegistryService {
  /**
   * List all skills from all sources: local, upstream, and MCP.
   *
   * Returns merged source values per D-17, D-20. MCP rows are globally
   * visible with no per-agent support fields.
   */
  static async list(orgId: string): Promise<SkillRegistryEntry[]> {
    const ormHandle = await ormForRegistry();
    try {
      const em = ormHandle.orm.em.fork();
      const skills = await em.find(
        FulcrumSkill,
        { org: orgId },
        { orderBy: { slug: "ASC" } },
      );

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
      await ormHandle.close();
    }
  }
}
