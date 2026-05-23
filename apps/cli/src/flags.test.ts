import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import { parseArgs, formatOutput } from "./flags.ts";
import { experimentStore } from "@feature-flags/application/experiments.ts";

describe("flags CLI", () => {
  afterEach(() => {
    delete process.env["FULCRUM_FEATURES"];
  });

  describe("parseArgs", () => {
    test("parses set command", () => {
      expect(parseArgs(["set", "experiments", "on"])).toEqual({
        action: "set",
        flag: "experiments",
        value: true,
      });
    });

    test("parses set off", () => {
      expect(parseArgs(["set", "desktop-app", "off"])).toEqual({
        action: "set",
        flag: "desktop-app",
        value: false,
      });
    });

    test("parses get command", () => {
      expect(parseArgs(["get", "experiments"])).toEqual({
        action: "get",
        flag: "experiments",
      });
    });

    test("parses list command", () => {
      expect(parseArgs(["list"])).toEqual({ action: "list" });
    });

    test("returns error for unknown flag", () => {
      expect(parseArgs(["set", "bogus", "on"])).toEqual({
        action: "error",
        message: "unknown flag: bogus",
      });
    });
  });

  describe("formatOutput", () => {
    test("formats list output", () => {
      process.env["FULCRUM_FEATURES"] = "experiments,desktop-app";
      const out = formatOutput({ action: "list" }, false);
      expect(out).toContain("experiments");
      expect(out).toContain("desktop-app");
      expect(out).toContain("ON");
    });

    test("formats get output", () => {
      process.env["FULCRUM_FEATURES"] = "experiments";
      const out = formatOutput({ action: "get", flag: "experiments" }, false);
      expect(out).toContain("ON");
    });

    test("formats list as JSON", () => {
      process.env["FULCRUM_FEATURES"] = "experiments";
      const out = formatOutput({ action: "list" }, true);
      const parsed = JSON.parse(out);
      expect(parsed.experiments).toBe(true);
      expect(parsed["desktop-app"]).toBe(false);
    });
  });

  describe("experiments sub-commands", () => {
    beforeEach(() => {
      experimentStore._reset();
    });

    test("parseArgs experiments list", () => {
      expect(parseArgs(["experiments", "list"])).toEqual({ action: "experiments:list" });
    });

    test("parseArgs experiments create", () => {
      expect(parseArgs(["experiments", "create", "--name", "btn-color", "--variants", "blue,red", "--rollout-percent", "50"])).toEqual({
        action: "experiments:create",
        name: "btn-color",
        variants: ["blue", "red"],
        rolloutPercent: 50,
      });
    });

    test("parseArgs experiments create requires --name", () => {
      const r = parseArgs(["experiments", "create"]);
      expect(r.action).toBe("error");
    });

    test("parseArgs experiments create requires 2+ variants", () => {
      const r = parseArgs(["experiments", "create", "--name", "x", "--variants", "only-one"]);
      expect(r.action).toBe("error");
    });

    test("parseArgs experiments metrics", () => {
      expect(parseArgs(["experiments", "metrics", "--experiment-id", "e1", "--conversion-kind", "task.created"])).toEqual({
        action: "experiments:metrics",
        experimentId: "e1",
        conversionKind: "task.created",
      });
    });

    test("formatOutput experiments:list empty", () => {
      const out = formatOutput({ action: "experiments:list" }, false);
      expect(out).toContain("No experiments");
    });

    test("formatOutput experiments:list with data", () => {
      experimentStore.create({ name: "my-exp", variants: ["A", "B"] });
      const out = formatOutput({ action: "experiments:list" }, false);
      expect(out).toContain("my-exp");
      expect(out).toContain("A,B");
    });

    test("formatOutput experiments:list as JSON", () => {
      experimentStore.create({ name: "json-exp", variants: ["X", "Y"], rolloutPercent: 75 });
      const out = formatOutput({ action: "experiments:list" }, true);
      const data = JSON.parse(out);
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].name).toBe("json-exp");
      expect(data[0].rolloutPercent).toBe(75);
    });

    test("formatOutput experiments:metrics as JSON", () => {
      const exp = experimentStore.create({ name: "m-exp", variants: ["A", "B"], rolloutPercent: 100 });
      experimentStore.assign(exp.id, "u1");
      experimentStore.recordConversion(exp.id, "u1", "task.done");
      const out = formatOutput({ action: "experiments:metrics", experimentId: exp.id, conversionKind: "task.done" }, true);
      const data = JSON.parse(out);
      expect(typeof data).toBe("object");
    });
  });
});
