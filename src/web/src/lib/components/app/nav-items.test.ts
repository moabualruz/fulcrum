import { describe, expect, test } from "bun:test";

import { LUCIDE_ICONS, NAV_ITEMS, type NavItem } from "./nav-items.ts";

describe("NAV_ITEMS surface", () => {
  test("declares feature-complete primary surface", () => {
    expect(NAV_ITEMS.length).toBeGreaterThanOrEqual(18);
  });

  test("exposes hrefs in declared order", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/",
      "/projects",
      "/docs",
      "/boards",
      "/agents",
      "/runs",
      "/artifacts",
      "/repos",
      "/memory",
      "/context/preview",
      "/orchestration",
      "/audit",
      "/search",
      "/doctor",
      "/settings/inference",
      "/settings/skills",
      "/settings/notifications",
      "/settings/orchestration",
      "/settings/data",
    ]);
  });

  test("exposes labels in declared order", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Dashboard",
      "Projects",
      "Docs",
      "Board",
      "Agents",
      "Runs",
      "Artifacts",
      "Repos",
      "Memory",
      "Context",
      "Orchestration",
      "Audit",
      "Search",
      "Doctor",
      "Inference",
      "Skills",
      "Notifications",
      "Workflow Settings",
      "Data",
    ]);
  });

  test("each entry uses an icon resolvable through LUCIDE_ICONS", () => {
    for (const item of NAV_ITEMS) {
      expect(LUCIDE_ICONS).toHaveProperty(item.iconName);
      expect(typeof LUCIDE_ICONS[item.iconName]).toBe("function");
    }
  });

  test("locks the icon assignment per entry", () => {
    const pairs: Array<[string, NavItem["iconName"]]> = [
      ["/", "LayoutDashboard"],
      ["/projects", "Folder"],
      ["/docs", "FileText"],
      ["/boards", "Kanban"],
      ["/agents", "Activity"],
      ["/runs", "Activity"],
      ["/artifacts", "FileText"],
      ["/repos", "Folder"],
      ["/memory", "FileText"],
      ["/context/preview", "FileText"],
      ["/orchestration", "Kanban"],
      ["/audit", "FileText"],
      ["/search", "Search"],
      ["/doctor", "Activity"],
      ["/settings/inference", "Settings"],
      ["/settings/skills", "Settings"],
      ["/settings/notifications", "Settings"],
      ["/settings/orchestration", "Settings"],
      ["/settings/data", "Settings"],
    ];
    for (const [href, iconName] of pairs) {
      const entry = NAV_ITEMS.find((i) => i.href === href);
      expect(entry?.iconName).toBe(iconName);
    }
  });
});
