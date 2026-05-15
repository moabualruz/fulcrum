import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestOrm, type TestOrm } from "../../src/test-utils/index.ts";
import { Org } from "../../src/db/entities/auth/Org.ts";
import {
  FulcrumSkill,
  SkillSource,
} from "../../src/db/entities/skills/index.ts";
import {
  __setRegistryServiceOrmForTest,
  SkillRegistryService,
} from "../../src/skills/registry-service.ts";

let testDb: TestOrm;

beforeEach(async () => {
  testDb = await createTestOrm();
  __setRegistryServiceOrmForTest(testDb.orm);
});

afterEach(async () => {
  __setRegistryServiceOrmForTest(undefined);
  await testDb.close();
});

describe("SkillRegistryService", () => {
  it("lists skills from the real registry table ordered by slug and scoped to one org", async () => {
    const em = testDb.orm.em.fork();
    const defaultOrg = await em.findOneOrFail(Org, { id: testDb.seed.orgId });
    const otherOrg = em.create(Org, {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Other org",
      slug: "other-org",
    });
    em.persist(otherOrg);

    em.create(FulcrumSkill, {
      org: defaultOrg,
      name: "Zulu Local",
      slug: "zulu",
      source: SkillSource.Local,
      enabledAgents: ["codex", "claude"],
    });
    em.create(FulcrumSkill, {
      org: defaultOrg,
      name: "Alpha Upstream",
      slug: "alpha",
      source: SkillSource.Upstream,
      upstreamRepo: "owner/repo",
      upstreamRef: "main",
      enabledAgents: ["opencode"],
    });
    em.create(FulcrumSkill, {
      org: defaultOrg,
      name: "Package Skill",
      slug: "package-skill",
      source: SkillSource.Package,
      enabledAgents: ["gemini"],
    });
    em.create(FulcrumSkill, {
      org: otherOrg,
      name: "Hidden Other Org",
      slug: "hidden",
      source: SkillSource.Upstream,
      enabledAgents: ["codex"],
    });
    await em.flush();

    const entries = await SkillRegistryService.list(testDb.seed.orgId);

    expect(entries).toEqual([
      {
        slug: "alpha",
        name: "Alpha Upstream",
        source: "upstream",
        version: null,
        enabledAgents: ["opencode"],
      },
      {
        slug: "package-skill",
        name: "Package Skill",
        source: "local",
        version: null,
        enabledAgents: ["gemini"],
      },
      {
        slug: "zulu",
        name: "Zulu Local",
        source: "local",
        version: null,
        enabledAgents: ["codex", "claude"],
      },
    ]);
  });
});
