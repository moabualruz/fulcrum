import type { SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";
import { newUlid } from "@platform-core/application/platform-primitives/monotonic-id.ts";

export type LegacyDatabaseHandle = SqlExecutor;
export { newUlid };

const PRODUCT_STORE = "../../infrastructure/product-store";

async function loadModule(path: string): Promise<Record<string, any>> {
  return await import(`${PRODUCT_STORE}/${path}.ts`) as Record<string, any>;
}

async function call(path: string, name: string, args: unknown[]): Promise<any> {
  const mod = await loadModule(path);
  const fn = mod[name];
  if (typeof fn !== "function") throw new Error(`Missing legacy export ${name}`);
  return await fn(...args);
}

export const eventDispatcher = {
  dispatch: async (...args: unknown[]) => {
    const dispatcher = (await loadModule("event-dispatcher"))["eventDispatcher"];
    if (!dispatcher || typeof dispatcher.dispatch !== "function") {
      throw new Error("Missing legacy event dispatcher.");
    }
    return dispatcher.dispatch(...args);
  },
};

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  backend: string;
}

export function parseFeatures(raw?: string): FeatureFlag[] {
  const input = raw ?? process.env["FULCRUM_FEATURES"] ?? "";
  return input
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, enabled: true, backend: "env" }));
}

export function isFeatureEnabled(nameOrFlags: string | readonly FeatureFlag[], maybeName?: string): boolean {
  if (Array.isArray(nameOrFlags)) {
    return nameOrFlags.some((flag) => flag.name === maybeName && flag.enabled);
  }
  return parseFeatures().some((flag) => flag.name === nameOrFlags && flag.enabled);
}

export function getFeatureBackend(flags: readonly FeatureFlag[], name: string): string | null {
  return flags.find((flag) => flag.name === name && flag.enabled)?.backend ?? null;
}

export function loadFeatures(): FeatureFlag[] {
  return parseFeatures();
}

export async function addTaskToSprint(...args: unknown[]) { return call("store/repositories", "addTaskToSprint", args); }
export async function appendEvent(...args: unknown[]) { return call("store/repositories", "appendEvent", args); }
export async function closeSprint(...args: unknown[]) { return call("store/repositories", "closeSprint", args); }
export async function createLocalOrg(...args: unknown[]) { return call("store/repositories", "createLocalOrg", args); }
export async function createProject(...args: unknown[]) { return call("store/repositories", "createProject", args); }
export async function createSprint(...args: unknown[]) { return call("store/repositories", "createSprint", args); }
export async function listBacklogTasks(...args: unknown[]) { return call("store/repositories", "listBacklogTasks", args); }
export async function listEventsFiltered(...args: unknown[]) { return call("store/repositories", "listEventsFiltered", args); }
export async function listReposForProject(...args: unknown[]) { return call("store/repositories", "listReposForProject", args); }
export async function listSprints(...args: unknown[]) { return call("store/repositories", "listSprints", args); }
export async function listSprintTasks(...args: unknown[]) { return call("store/repositories", "listSprintTasks", args); }
export async function linkRepoToProject(...args: unknown[]) { return call("store/repositories", "linkRepoToProject", args); }
export async function removeTaskFromSprint(...args: unknown[]) { return call("store/repositories", "removeTaskFromSprint", args); }
export async function sprintCapacityUsed(...args: unknown[]) { return call("store/repositories", "sprintCapacityUsed", args); }
export async function updateSprint(...args: unknown[]) { return call("store/repositories", "updateSprint", args); }

export type EventRow = Record<string, unknown>;
export type MetricsSnapshot = Record<string, unknown>;
export type RepoRow = Record<string, unknown>;
export type SprintRow = Record<string, unknown>;
export type TaskRow = Record<string, unknown>;

export async function getBlameForFile(...args: unknown[]) { return call("store/repo-files", "getBlameForFile", args); }
export async function getFileByPath(...args: unknown[]) { return call("store/repo-files", "getFileByPath", args); }
export async function getFileContent(...args: unknown[]) { return call("store/repo-files", "getFileContent", args); }
export async function listIndexedBranches(...args: unknown[]) { return call("store/repo-files", "listIndexedBranches", args); }
export async function listTreeChildren(...args: unknown[]) { return call("store/repo-files", "listTreeChildren", args); }

export type RepoFileBlameRow = Record<string, unknown>;
export type RepoFileContentRow = Record<string, unknown>;
export type RepoFileRow = Record<string, unknown>;

export interface RoutingRuleRow { id: string; [key: string]: unknown }
export interface CreateRoutingRuleInput { [key: string]: unknown }
export interface CreateSavedViewInput { [key: string]: unknown }
export interface CreateCustomFieldInput { [key: string]: unknown }

export async function createRoutingRule(...args: unknown[]) { return call("store/settings", "createRoutingRule", args); }
export async function listRoutingRules(...args: unknown[]) { return call("store/settings", "listRoutingRules", args); }
export async function updateRoutingRule(...args: unknown[]) { return call("store/settings", "updateRoutingRule", args); }
export async function deleteRoutingRule(...args: unknown[]) { return call("store/settings", "deleteRoutingRule", args); }
export async function listFeatureFlags(...args: unknown[]) { return call("store/settings", "listFeatureFlags", args); }
export async function setFeatureFlag(...args: unknown[]) { return call("store/settings", "setFeatureFlag", args); }
export async function createCustomFieldDef(...args: unknown[]) { return call("store/settings", "createCustomFieldDef", args); }
export async function listCustomFieldDefs(...args: unknown[]) { return call("store/settings", "listCustomFieldDefs", args); }
export async function deleteCustomFieldDef(...args: unknown[]) { return call("store/settings", "deleteCustomFieldDef", args); }
export async function reorderCustomFieldDefs(...args: unknown[]) { return call("store/settings", "reorderCustomFieldDefs", args); }
export async function createSavedView(...args: unknown[]) { return call("store/settings", "createSavedView", args); }
export async function listSavedViews(...args: unknown[]) { return call("store/settings", "listSavedViews", args); }
export async function updateSavedView(...args: unknown[]) { return call("store/settings", "updateSavedView", args); }
export async function deleteSavedView(...args: unknown[]) { return call("store/settings", "deleteSavedView", args); }
export async function listMembers(...args: unknown[]) { return call("store/settings", "listMembers", args); }
export async function addMember(...args: unknown[]) { return call("store/settings", "addMember", args); }
export async function updateMemberRole(...args: unknown[]) { return call("store/settings", "updateMemberRole", args); }
export async function createInvitation(...args: unknown[]) { return call("store/settings", "createInvitation", args); }
export async function listInvitations(...args: unknown[]) { return call("store/settings", "listInvitations", args); }

export interface SettingsScreen {
  key: string;
  label: string;
  group: string;
}

export const SETTINGS_SCREENS: SettingsScreen[] = [
  { key: "routing-rules", label: "Routing Rules", group: "Agent" },
  { key: "skills", label: "Skills", group: "Agent" },
  { key: "feature-flags", label: "Feature Flags", group: "General" },
  { key: "custom-fields", label: "Custom Fields", group: "Project" },
  { key: "saved-views", label: "Saved Views", group: "Project" },
  { key: "members", label: "Members", group: "Organization" },
  { key: "invitations", label: "Invitations", group: "Organization" },
  { key: "auth", label: "Auth", group: "Account" },
  { key: "profile", label: "Profile", group: "Account" },
  { key: "notifications", label: "Notifications", group: "General" },
  { key: "theme", label: "Theme", group: "General" },
  { key: "keyboard", label: "Keyboard Shortcuts", group: "General" },
  { key: "integrations", label: "Integrations", group: "General" },
  { key: "backups", label: "Backups", group: "General" },
  { key: "about", label: "About", group: "General" },
];

export function settingsScreenGroups(): Map<string, SettingsScreen[]> {
  const groups = new Map<string, SettingsScreen[]>();
  for (const screen of SETTINGS_SCREENS) {
    const list = groups.get(screen.group) ?? [];
    list.push(screen);
    groups.set(screen.group, list);
  }
  return groups;
}

export function settingsBreadcrumb(key: string): string[] {
  const screen = SETTINGS_SCREENS.find((s) => s.key === key);
  if (!screen) return ["Settings"];
  return ["Settings", screen.group, screen.label];
}

export async function createConnectorRun(...args: unknown[]) { return call("store/settings-connectors-credentials", "createConnectorRun", args); }
export async function createCredential(...args: unknown[]) { return call("store/settings-connectors-credentials", "createCredential", args); }
export async function deleteCredential(...args: unknown[]) { return call("store/settings-connectors-credentials", "deleteCredential", args); }
export async function getTenantSetting(...args: unknown[]) { return call("store/settings-connectors-credentials", "getTenantSetting", args); }
export async function listConnectorRuns(...args: unknown[]) { return call("store/settings-connectors-credentials", "listConnectorRuns", args); }
export async function listCredentials(...args: unknown[]) { return call("store/settings-connectors-credentials", "listCredentials", args); }
export async function listTenantSettings(...args: unknown[]) { return call("store/settings-connectors-credentials", "listTenantSettings", args); }
export async function upsertTenantSetting(...args: unknown[]) { return call("store/settings-connectors-credentials", "upsertTenantSetting", args); }
