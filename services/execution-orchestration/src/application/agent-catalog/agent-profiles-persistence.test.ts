import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { AgentProfile } from "@execution-orchestration/infrastructure/database/entities/sandbox/AgentProfile.ts";
import { createTestCaller, createTestContainer, createTestOrm, type TestOrm } from "@test-support/index.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";

// Temp script paths are allowlisted for these profile-probe tests.
let testCliPaths: string[] = [];

async function writeVersionScript(dir: string, name: string, exitCode: number): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh\nexit ${exitCode}\n`, "utf8");
  await chmod(path, 0o755);
  return path;
}

async function setupProfile(name: string, cliPath: string): Promise<TestOrm> {
  const db = await createTestOrm();
  const em = db.em;
  const orgRef = em.getReference(Org, ORG_ID);
  const profile = em.create(AgentProfile, {
    org: orgRef,
    name,
    cliPath,
    defaultFlags: ["--version"],
    authEnvVars: [],
    maxIterations: 10,
    defaultTimeout: 600000,
  });
  await em.save(profile);
  em.clear();
  return db;
}

describe("agents.testProfile persistence", () => {
  let db: TestOrm | undefined;

  afterEach(async () => {
    await db?.close();
    db = undefined;
  });

  test("persists lastTestedAt and testPassed=true after a successful version check", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fulcrum-agent-profile-"));
    const cliPath = await writeVersionScript(dir, "agent-ok", 0);
    testCliPaths.push(cliPath);
    process.env["FULCRUM_AGENT_CLI_ALLOWLIST"] = testCliPaths.join(",");
    db = await setupProfile("agent-ok", cliPath);
    const caller = await createTestCaller(createTestContainer(db));

    const result = await caller.agents.testProfile({ name: "agent-ok" });

    expect(result.testPassed).toBe(true);
    const stored = await db.em.findOneOrFail(AgentProfile, { org: ORG_ID, name: "agent-ok" });
    expect(stored.testPassed).toBe(true);
    expect(stored.lastTestedAt).toBeInstanceOf(Date);
  });

  test("persists lastTestedAt and testPassed=false after a failed version check", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fulcrum-agent-profile-"));
    const cliPath = await writeVersionScript(dir, "agent-fail", 7);
    testCliPaths.push(cliPath);
    process.env["FULCRUM_AGENT_CLI_ALLOWLIST"] = testCliPaths.join(",");
    db = await setupProfile("agent-fail", cliPath);
    const caller = await createTestCaller(createTestContainer(db));

    const result = await caller.agents.testProfile({ name: "agent-fail" });

    expect(result.testPassed).toBe(false);
    const stored = await db.em.findOneOrFail(AgentProfile, { org: ORG_ID, name: "agent-fail" });
    expect(stored.testPassed).toBe(false);
    expect(stored.lastTestedAt).toBeInstanceOf(Date);
  });
});
