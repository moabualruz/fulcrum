import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_AGENT_IDS } from "./mcp-registry.ts";
import { run } from "./component.ts";

function captureConsole(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  return {
    logs,
    restore: () => {
      console.log = originalLog;
    },
  };
}

describe("fulcrum component list", () => {
  test("--json includes default profile and repomix package summary", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["list", "--json"]);
    } finally {
      restore();
    }

    const parsed = JSON.parse(logs.join("")) as Array<{
      id: string;
      kind: string;
      description: string;
      defaultProfile?: boolean;
    }>;
    expect(parsed.find((component) => component.id === "profile.default")).toMatchObject({
      id: "profile.default",
      kind: "profile",
      description: "default Fulcrum setup profile",
    });
    expect(parsed.find((component) => component.id === "package.repomix")).toMatchObject({
      id: "package.repomix",
      kind: "package",
    });
  });

  test("human output lists component ids and descriptions", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["list"]);
    } finally {
      restore();
    }

    const combined = logs.join("\n");
    expect(combined).toContain("Fulcrum components:");
    expect(combined).toContain("profile.default");
    expect(combined).toContain("default Fulcrum setup profile");
  });

  test("rejects stray positional arguments", async () => {
    await expect(run(["list", "extra"])).rejects.toThrow(
      "unexpected argument for component list: extra",
    );
  });
});

describe("fulcrum component info", () => {
  test("package.repomix --json returns id and non-empty surfaces", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["info", "package.repomix", "--json"]);
    } finally {
      restore();
    }

    const parsed = JSON.parse(logs.join("")) as {
      id: string;
      surfaces: unknown[];
    };
    expect(parsed.id).toBe("package.repomix");
    expect(parsed.surfaces.length).toBeGreaterThan(0);
  });

  test("unknown component throws clear error", async () => {
    expect(run(["info", "missing.component", "--json"])).rejects.toThrow(
      "unknown component: missing.component",
    );
  });

  test("rejects extra positional arguments", async () => {
    await expect(run(["info", "package.repomix", "extra", "--json"])).rejects.toThrow(
      "unexpected argument for component info: extra",
    );
  });
});

describe("fulcrum component plan", () => {
  test("install hooks.format --agent codex --json returns one codex action", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["plan", "install", "hooks.format", "--agent", "codex", "--json"]);
    } finally {
      restore();
    }

    const parsed = JSON.parse(logs.join("")) as {
      actions: Array<{ componentId: string; agentId?: string; operation: string }>;
    };
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]).toMatchObject({
      componentId: "hooks.format",
      agentId: "codex",
      operation: "install",
    });
  });

  test("invalid --agent is rejected", async () => {
    expect(run(["plan", "install", "hooks.format", "--agent", "bad-agent"])).rejects.toThrow(
      "unknown agent: bad-agent",
    );
  });

  test("--agent followed by --json reports missing agent value", async () => {
    await expect(run(["plan", "install", "hooks.format", "--agent", "--json"])).rejects.toThrow(
      "missing value for --agent",
    );
  });

  test("no agent flag defaults to all agents", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["plan", "install", "hooks.format", "--json"]);
    } finally {
      restore();
    }

    const parsed = JSON.parse(logs.join("")) as {
      agents: string[];
      actions: Array<{ agentId?: string }>;
    };
    expect(parsed.agents).toEqual([...ALL_AGENT_IDS]);
    expect(parsed.actions.map((action) => action.agentId)).toEqual([...ALL_AGENT_IDS]);
  });
});

describe("fulcrum component apply", () => {
  test("install --dry-run plans and executes without writing", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["install", "hooks.format", "--agent", "codex", "--dry-run"]);
    } finally {
      restore();
    }

    const combined = logs.join("\n");
    expect(combined).toContain("DRY RUN");
    expect(combined).toContain("hooks.format");
  });

  test("install --json prints the plan before dry-run execution", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["install", "hooks.format", "--agent", "codex", "--dry-run", "--json"]);
    } finally {
      restore();
    }

    const plan = JSON.parse(logs[0] ?? "") as { target: string; actions: unknown[] };
    expect(plan.target).toBe("hooks.format");
    expect(plan.actions).toHaveLength(1);
    expect(logs.join("\n")).toContain("DRY RUN");
  });

  test("remove --purge removes modified managed policy", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-component-purge-"));
    const previousFulcrumHome = process.env["FULCRUM_HOME"];
    const policyPath = join(home, ".fulcrum", "tool-output-policy.toml");
    process.env["FULCRUM_HOME"] = join(home, ".fulcrum");
    try {
      await mkdir(join(home, ".fulcrum"), { recursive: true });
      await Bun.write(policyPath, "user modified\n");

      await run(["remove", "policy.tool-output", "--purge"]);

      expect(await Bun.file(policyPath).exists()).toBe(false);
    } finally {
      if (previousFulcrumHome === undefined) {
        delete process.env["FULCRUM_HOME"];
      } else {
        process.env["FULCRUM_HOME"] = previousFulcrumHome;
      }
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("fulcrum component status", () => {
  test("--json reports ledger component state", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-component-status-"));
    const previousFulcrumHome = process.env["FULCRUM_HOME"];
    process.env["FULCRUM_HOME"] = join(home, ".fulcrum");
    try {
      const { ComponentLedger } = await import("../components/ledger.ts");
      const ledger = ComponentLedger.open();
      ledger.recordComponent({ id: "hooks.format", kind: "hook", status: "installed" });
      ledger.close();

      const { logs, restore } = captureConsole();
      try {
        await run(["status", "hooks.format", "--json"]);
      } finally {
        restore();
      }

      const parsed = JSON.parse(logs.join("\n")) as { componentId: string; status: string };
      expect(parsed).toMatchObject({ componentId: "hooks.format", status: "installed" });
    } finally {
      if (previousFulcrumHome === undefined) {
        delete process.env["FULCRUM_HOME"];
      } else {
        process.env["FULCRUM_HOME"] = previousFulcrumHome;
      }
      await rm(home, { recursive: true, force: true });
    }
  });

  test("package --json includes parity reports", async () => {
    const { logs, restore } = captureConsole();
    try {
      await run(["status", "package.repomix", "--json"]);
    } finally {
      restore();
    }

    const parsed = JSON.parse(logs.join("\n")) as { componentId: string; parity?: unknown };
    expect(parsed.componentId).toBe("package.repomix");
    expect(parsed.parity).toBeDefined();
    expect(JSON.stringify(parsed.parity)).toContain("sourceCounts");
  });
});
