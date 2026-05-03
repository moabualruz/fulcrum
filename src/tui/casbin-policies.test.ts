import { describe, expect, test, afterEach } from "bun:test";
import {
  CasbinPoliciesPanel,
  type CasbinRule,
} from "./casbin-policies.ts";

describe("CasbinPoliciesPanel", () => {
  afterEach(() => {
    delete process.env["FULCRUM_FEATURES"];
  });

  test("hidden when casbin-policies flag OFF", () => {
    delete process.env["FULCRUM_FEATURES"];
    const panel = new CasbinPoliciesPanel();
    expect(panel.isVisible()).toBe(false);
  });

  test("visible when casbin-policies flag ON", () => {
    process.env["FULCRUM_FEATURES"] = "casbin-policies";
    const panel = new CasbinPoliciesPanel();
    expect(panel.isVisible()).toBe(true);
  });

  test("CRUD: create rule", () => {
    process.env["FULCRUM_FEATURES"] = "casbin-policies";
    const panel = new CasbinPoliciesPanel();
    const rule = panel.addRule({
      subject: "admin",
      object: "project/*",
      action: "read",
      effect: "allow",
    });
    expect(rule.id).toBeTruthy();
    expect(panel.listRules()).toHaveLength(1);
  });

  test("CRUD: read rules", () => {
    process.env["FULCRUM_FEATURES"] = "casbin-policies";
    const panel = new CasbinPoliciesPanel();
    panel.addRule({ subject: "admin", object: "project/*", action: "read", effect: "allow" });
    panel.addRule({ subject: "viewer", object: "project/*", action: "read", effect: "allow" });
    expect(panel.listRules()).toHaveLength(2);
  });

  test("CRUD: update rule", () => {
    process.env["FULCRUM_FEATURES"] = "casbin-policies";
    const panel = new CasbinPoliciesPanel();
    const rule = panel.addRule({ subject: "admin", object: "project/*", action: "read", effect: "allow" });
    panel.updateRule(rule.id, { action: "write" });
    const updated = panel.getRule(rule.id);
    expect(updated?.action).toBe("write");
  });

  test("CRUD: delete rule", () => {
    process.env["FULCRUM_FEATURES"] = "casbin-policies";
    const panel = new CasbinPoliciesPanel();
    const rule = panel.addRule({ subject: "admin", object: "project/*", action: "read", effect: "allow" });
    panel.deleteRule(rule.id);
    expect(panel.listRules()).toHaveLength(0);
  });

  test("rule syntax preview", () => {
    process.env["FULCRUM_FEATURES"] = "casbin-policies";
    const panel = new CasbinPoliciesPanel();
    const rule = panel.addRule({ subject: "admin", object: "project/*", action: "read", effect: "allow" });
    const preview = panel.syntaxPreview(rule.id);
    expect(preview).toBe("p, admin, project/*, read, allow");
  });

  test("save writes casbin-policies rule", () => {
    process.env["FULCRUM_FEATURES"] = "casbin-policies";
    const panel = new CasbinPoliciesPanel();
    panel.addRule({ subject: "admin", object: "project/*", action: "read", effect: "allow" });
    const saved = panel.save();
    expect(saved.type).toBe("casbin-policies");
    expect(saved.rules).toHaveLength(1);
  });

  test("not in navigator when OFF", () => {
    delete process.env["FULCRUM_FEATURES"];
    const panel = new CasbinPoliciesPanel();
    expect(panel.navigatorEntry()).toBeNull();
  });

  test("in navigator when ON", () => {
    process.env["FULCRUM_FEATURES"] = "casbin-policies";
    const panel = new CasbinPoliciesPanel();
    expect(panel.navigatorEntry()).toEqual({
      label: "Permissions",
      path: "settings/permissions",
    });
  });
});
