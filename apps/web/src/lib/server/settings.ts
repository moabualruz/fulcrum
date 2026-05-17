import {
  createRoutingRule,
  listRoutingRules,
  updateRoutingRule,
  deleteRoutingRule,
  listFeatureFlags,
  setFeatureFlag,
  createCustomFieldDef,
  listCustomFieldDefs,
  deleteCustomFieldDef,
  reorderCustomFieldDefs,
  createSavedView,
  listSavedViews,
  updateSavedView,
  deleteSavedView,
  listMembers,
  addMember,
  updateMemberRole,
  createInvitation,
  listInvitations,
  SETTINGS_SCREENS,
  settingsScreenGroups,
  settingsBreadcrumb,
  type CreateRoutingRuleInput,
  type CreateCustomFieldInput,
  type CreateSavedViewInput,
} from "@platform-core/application/legacy/web-runtime.ts";

type SettingsActionStore = Parameters<typeof listRoutingRules>[0];

// --- Settings Navigator ---

export function getSettingsScreens() {
  return SETTINGS_SCREENS;
}

export function getSettingsGroups() {
  return settingsScreenGroups();
}

export function getBreadcrumb(key: string) {
  return settingsBreadcrumb(key);
}

// --- Routing Rules Actions ---

export async function routingRulesListAction(db: SettingsActionStore, orgId: string, projectId?: string | null) {
  return listRoutingRules(db, orgId, projectId);
}

export async function routingRuleCreateAction(db: SettingsActionStore, input: CreateRoutingRuleInput) {
  return createRoutingRule(db, input);
}

export async function routingRuleUpdateAction(
  db: SettingsActionStore,
  id: string,
  orgId: string,
  update: { ruleJson?: Record<string, unknown>; priority?: number },
) {
  return updateRoutingRule(db, id, orgId, update);
}

export async function routingRuleDeleteAction(db: SettingsActionStore, id: string, orgId: string) {
  return deleteRoutingRule(db, id, orgId);
}

// --- Feature Flags Actions ---

export async function featureFlagsListAction(db: SettingsActionStore, orgId: string) {
  return listFeatureFlags(db, orgId);
}

export async function featureFlagSetAction(db: SettingsActionStore, orgId: string, key: string, enabled: boolean) {
  return setFeatureFlag(db, orgId, key, enabled);
}

// --- Custom Fields Actions ---

export async function customFieldsListAction(db: SettingsActionStore, orgId: string, projectId?: string | null) {
  return listCustomFieldDefs(db, orgId, projectId);
}

export async function customFieldCreateAction(db: SettingsActionStore, input: CreateCustomFieldInput) {
  return createCustomFieldDef(db, input);
}

export async function customFieldDeleteAction(db: SettingsActionStore, id: string, orgId: string) {
  return deleteCustomFieldDef(db, id, orgId);
}

export async function customFieldReorderAction(db: SettingsActionStore, orgId: string, orderedIds: string[]) {
  return reorderCustomFieldDefs(db, orgId, orderedIds);
}

// --- Saved Views Actions ---

export async function savedViewsListAction(db: SettingsActionStore, orgId: string, projectId?: string | null) {
  return listSavedViews(db, orgId, projectId);
}

export async function savedViewCreateAction(db: SettingsActionStore, input: CreateSavedViewInput) {
  return createSavedView(db, input);
}

export async function savedViewUpdateAction(
  db: SettingsActionStore,
  id: string,
  orgId: string,
  update: { name?: string; filterAst?: Record<string, unknown>; isDefault?: boolean },
) {
  return updateSavedView(db, id, orgId, update);
}

export async function savedViewDeleteAction(db: SettingsActionStore, id: string, orgId: string) {
  return deleteSavedView(db, id, orgId);
}

// --- Members & Invitations Actions ---

export async function membersListAction(db: SettingsActionStore, orgId: string) {
  return listMembers(db, orgId);
}

export async function memberAddAction(db: SettingsActionStore, orgId: string, email: string, role?: string) {
  return addMember(db, orgId, email, role);
}

export async function memberRoleUpdateAction(db: SettingsActionStore, id: string, orgId: string, role: string) {
  return updateMemberRole(db, id, orgId, role);
}

export async function invitationsListAction(db: SettingsActionStore, orgId: string) {
  return listInvitations(db, orgId);
}

export async function invitationCreateAction(
  db: SettingsActionStore,
  orgId: string,
  email: string,
  role?: string,
  invitedBy?: string,
) {
  return createInvitation(db, orgId, email, role, invitedBy);
}
