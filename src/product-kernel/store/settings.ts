import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";

// --- Routing Rules ---

export interface RoutingRuleRow {
  id: string;
  org_id: string;
  project_id: string | null;
  rule_json: Record<string, unknown>;
  priority: number;
  created_by: string;
  created_at: string;
}

export interface CreateRoutingRuleInput {
  orgId: string;
  projectId?: string | null;
  ruleJson: Record<string, unknown>;
  priority?: number;
  createdBy?: string;
}

export async function createRoutingRule(
  db: ProductDb,
  input: CreateRoutingRuleInput,
): Promise<RoutingRuleRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO routing_rules (id, org_id, project_id, rule_json, priority, created_by)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [id, input.orgId, input.projectId ?? null, JSON.stringify(input.ruleJson), input.priority ?? 0, input.createdBy ?? "system"],
  );
  const rows = await db.query<RoutingRuleRow>(`SELECT * FROM routing_rules WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`routing_rule insert lost: ${id}`);
  return rows[0] as RoutingRuleRow;
}

export async function listRoutingRules(
  db: ProductDb,
  orgId: string,
  projectId?: string | null,
): Promise<RoutingRuleRow[]> {
  if (projectId !== undefined) {
    if (projectId === null) {
      return db.query<RoutingRuleRow>(
        `SELECT * FROM routing_rules WHERE org_id = $1 AND project_id IS NULL ORDER BY priority DESC, created_at ASC`,
        [orgId],
      );
    }
    return db.query<RoutingRuleRow>(
      `SELECT * FROM routing_rules WHERE org_id = $1 AND project_id = $2 ORDER BY priority DESC, created_at ASC`,
      [orgId, projectId],
    );
  }
  return db.query<RoutingRuleRow>(
    `SELECT * FROM routing_rules WHERE org_id = $1 ORDER BY priority DESC, created_at ASC`,
    [orgId],
  );
}

export async function updateRoutingRule(
  db: ProductDb,
  id: string,
  orgId: string,
  update: { ruleJson?: Record<string, unknown>; priority?: number },
): Promise<RoutingRuleRow> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (update.ruleJson !== undefined) {
    params.push(JSON.stringify(update.ruleJson));
    sets.push(`rule_json = $${params.length}::jsonb`);
  }
  if (update.priority !== undefined) {
    params.push(update.priority);
    sets.push(`priority = $${params.length}`);
  }
  if (sets.length === 0) throw new Error("updateRoutingRule: no fields");
  params.push(id);
  const idIdx = params.length;
  params.push(orgId);
  const orgIdx = params.length;
  const rows = await db.query<RoutingRuleRow>(
    `UPDATE routing_rules SET ${sets.join(", ")} WHERE id = $${idIdx} AND org_id = $${orgIdx} RETURNING *`,
    params,
  );
  if (rows.length === 0) throw new Error(`routing_rule not found: ${id}`);
  return rows[0] as RoutingRuleRow;
}

export async function deleteRoutingRule(db: ProductDb, id: string, orgId: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `DELETE FROM routing_rules WHERE id = $1 AND org_id = $2 RETURNING id`,
    [id, orgId],
  );
  return rows.length > 0;
}

// --- Feature Flags ---

export interface FeatureFlagRow {
  id: string;
  org_id: string;
  key: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function listFeatureFlags(db: ProductDb, orgId: string): Promise<FeatureFlagRow[]> {
  return db.query<FeatureFlagRow>(
    `SELECT * FROM feature_flags WHERE org_id = $1 ORDER BY key ASC`,
    [orgId],
  );
}

export async function setFeatureFlag(
  db: ProductDb,
  orgId: string,
  key: string,
  enabled: boolean,
): Promise<FeatureFlagRow> {
  const id = newUlid();
  const rows = await db.query<FeatureFlagRow>(
    `INSERT INTO feature_flags (id, org_id, key, enabled)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, key) DO UPDATE SET enabled = $4, updated_at = now()
     RETURNING *`,
    [id, orgId, key, enabled],
  );
  return rows[0] as FeatureFlagRow;
}

// --- Custom Field Defs ---

export interface CustomFieldDefRow {
  id: string;
  org_id: string;
  project_id: string | null;
  name: string;
  field_type: string;
  options: unknown[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomFieldInput {
  orgId: string;
  projectId?: string | null;
  name: string;
  fieldType: string;
  options?: unknown[];
  sortOrder?: number;
}

export async function createCustomFieldDef(
  db: ProductDb,
  input: CreateCustomFieldInput,
): Promise<CustomFieldDefRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO custom_field_defs (id, org_id, project_id, name, field_type, options, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [id, input.orgId, input.projectId ?? null, input.name, input.fieldType, JSON.stringify(input.options ?? []), input.sortOrder ?? 0],
  );
  const rows = await db.query<CustomFieldDefRow>(`SELECT * FROM custom_field_defs WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`custom_field_def insert lost: ${id}`);
  return rows[0] as CustomFieldDefRow;
}

export async function listCustomFieldDefs(
  db: ProductDb,
  orgId: string,
  projectId?: string | null,
): Promise<CustomFieldDefRow[]> {
  if (projectId !== undefined) {
    if (projectId === null) {
      return db.query<CustomFieldDefRow>(
        `SELECT * FROM custom_field_defs WHERE org_id = $1 AND project_id IS NULL ORDER BY sort_order ASC`,
        [orgId],
      );
    }
    return db.query<CustomFieldDefRow>(
      `SELECT * FROM custom_field_defs WHERE org_id = $1 AND project_id = $2 ORDER BY sort_order ASC`,
      [orgId, projectId],
    );
  }
  return db.query<CustomFieldDefRow>(
    `SELECT * FROM custom_field_defs WHERE org_id = $1 ORDER BY sort_order ASC`,
    [orgId],
  );
}

export async function deleteCustomFieldDef(db: ProductDb, id: string, orgId: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `DELETE FROM custom_field_defs WHERE id = $1 AND org_id = $2 RETURNING id`,
    [id, orgId],
  );
  return rows.length > 0;
}

export async function reorderCustomFieldDefs(
  db: ProductDb,
  orgId: string,
  orderedIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.query(
      `UPDATE custom_field_defs SET sort_order = $1, updated_at = now() WHERE id = $2 AND org_id = $3`,
      [i, orderedIds[i]!, orgId],
    );
  }
}

// --- Saved Views ---

export interface SavedViewRow {
  id: string;
  org_id: string;
  project_id: string | null;
  name: string;
  filters: Record<string, unknown>;
  filter_ast?: Record<string, unknown>;
  scope: string;
  is_default: boolean;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSavedViewInput {
  orgId: string;
  projectId?: string | null;
  name: string;
  filterAst?: Record<string, unknown>;
  scope?: string;
  isDefault?: boolean;
  createdBy?: string;
}

export async function createSavedView(
  db: ProductDb,
  input: CreateSavedViewInput,
): Promise<SavedViewRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO saved_views (id, org_id, project_id, name, filters, scope, is_default, owner_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
    [id, input.orgId, input.projectId ?? null, input.name, JSON.stringify(input.filterAst ?? {}), input.scope ?? "private", input.isDefault ?? false, input.createdBy ?? null],
  );
  const rows = await db.query<SavedViewRow>(`SELECT * FROM saved_views WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`saved_view insert lost: ${id}`);
  return rows[0] as SavedViewRow;
}

export async function listSavedViews(
  db: ProductDb,
  orgId: string,
  projectId?: string | null,
): Promise<SavedViewRow[]> {
  if (projectId !== undefined) {
    if (projectId === null) {
      return db.query<SavedViewRow>(
        `SELECT * FROM saved_views WHERE org_id = $1 AND project_id IS NULL ORDER BY name ASC`,
        [orgId],
      );
    }
    return db.query<SavedViewRow>(
      `SELECT * FROM saved_views WHERE org_id = $1 AND project_id = $2 ORDER BY name ASC`,
      [orgId, projectId],
    );
  }
  return db.query<SavedViewRow>(
    `SELECT * FROM saved_views WHERE org_id = $1 ORDER BY name ASC`,
    [orgId],
  );
}

export async function updateSavedView(
  db: ProductDb,
  id: string,
  orgId: string,
  update: { name?: string; filterAst?: Record<string, unknown>; isDefault?: boolean },
): Promise<SavedViewRow> {
  const sets: string[] = [];
  const params: (string | boolean | null)[] = [];
  if (update.name !== undefined) {
    params.push(update.name);
    sets.push(`name = $${params.length}`);
  }
  if (update.filterAst !== undefined) {
    params.push(JSON.stringify(update.filterAst));
    sets.push(`filters = $${params.length}::jsonb`);
  }
  if (update.isDefault !== undefined) {
    params.push(update.isDefault);
    sets.push(`is_default = $${params.length}`);
  }
  if (sets.length === 0) throw new Error("updateSavedView: no fields");
  sets.push(`updated_at = now()`);
  params.push(id);
  const idIdx = params.length;
  params.push(orgId);
  const orgIdx = params.length;
  const rows = await db.query<SavedViewRow>(
    `UPDATE saved_views SET ${sets.join(", ")} WHERE id = $${idIdx} AND org_id = $${orgIdx} RETURNING *`,
    params,
  );
  if (rows.length === 0) throw new Error(`saved_view not found: ${id}`);
  return rows[0] as SavedViewRow;
}

export async function deleteSavedView(db: ProductDb, id: string, orgId: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `DELETE FROM saved_views WHERE id = $1 AND org_id = $2 RETURNING id`,
    [id, orgId],
  );
  return rows.length > 0;
}

// --- Members ---

export interface MemberRow {
  id: string;
  org_id: string;
  user_email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export async function listMembers(db: ProductDb, orgId: string): Promise<MemberRow[]> {
  return db.query<MemberRow>(
    `SELECT * FROM members WHERE org_id = $1 ORDER BY created_at ASC`,
    [orgId],
  );
}

export async function addMember(
  db: ProductDb,
  orgId: string,
  email: string,
  role: string = "member",
): Promise<MemberRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO members (id, org_id, user_email, role) VALUES ($1, $2, $3, $4)`,
    [id, orgId, email, role],
  );
  const rows = await db.query<MemberRow>(`SELECT * FROM members WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`member insert lost: ${id}`);
  return rows[0] as MemberRow;
}

export async function updateMemberRole(
  db: ProductDb,
  id: string,
  orgId: string,
  role: string,
): Promise<MemberRow> {
  const rows = await db.query<MemberRow>(
    `UPDATE members SET role = $1, updated_at = now() WHERE id = $2 AND org_id = $3 RETURNING *`,
    [role, id, orgId],
  );
  if (rows.length === 0) throw new Error(`member not found: ${id}`);
  return rows[0] as MemberRow;
}

// --- Invitations ---

export interface InvitationRow {
  id: string;
  org_id: string;
  email: string;
  role: string;
  status: string;
  invited_by: string;
  created_at: string;
}

export async function createInvitation(
  db: ProductDb,
  orgId: string,
  email: string,
  role: string = "member",
  invitedBy: string = "system",
): Promise<InvitationRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO invitations (id, org_id, email, role, invited_by) VALUES ($1, $2, $3, $4, $5)`,
    [id, orgId, email, role, invitedBy],
  );
  const rows = await db.query<InvitationRow>(`SELECT * FROM invitations WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`invitation insert lost: ${id}`);
  return rows[0] as InvitationRow;
}

export async function listInvitations(db: ProductDb, orgId: string): Promise<InvitationRow[]> {
  return db.query<InvitationRow>(
    `SELECT * FROM invitations WHERE org_id = $1 ORDER BY created_at DESC`,
    [orgId],
  );
}

// --- Settings Navigator ---

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
