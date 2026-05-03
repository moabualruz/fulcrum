import { describe, expect, test, afterEach } from "bun:test";
import { parseArgs, formatOutput } from "./flags.ts";

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
});
