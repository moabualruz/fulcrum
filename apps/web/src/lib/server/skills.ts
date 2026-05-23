import {
  installWebSkill,
  listWebSkills,
  resolveWebSkillConflict,
  uninstallWebSkill,
  updateWebSkillEnabledAgents,
  upgradeAllWebSkills,
  upgradeWebSkill,
  type InstallSkillInput,
  type ConflictResolution,
  type ResolveConflictInput,
  type SkillRow,
  type SkillsWebScope,
  type UpstreamConflict,
} from "@platform-core/application/skills/web-actions.ts";

export type {
  InstallSkillInput,
  ConflictResolution,
  ResolveConflictInput,
  SkillRow,
  SkillsWebScope,
  UpstreamConflict,
};

export function listSkills(scope: SkillsWebScope): Promise<SkillRow[]> {
  return listWebSkills(scope);
}

export function installSkill(scope: SkillsWebScope, input: InstallSkillInput): Promise<SkillRow> {
  return installWebSkill(scope, input);
}

export function upgradeSkill(scope: SkillsWebScope, slug: string): Promise<SkillRow> {
  return upgradeWebSkill(scope, slug);
}

export function upgradeAllSkills(scope: SkillsWebScope): Promise<SkillRow[]> {
  return upgradeAllWebSkills(scope);
}

export function uninstallSkill(scope: SkillsWebScope, slug: string): Promise<void> {
  return uninstallWebSkill(scope, slug);
}

export function updateEnabledAgents(
  scope: SkillsWebScope,
  slug: string,
  enabledAgents: string[],
): Promise<SkillRow> {
  return updateWebSkillEnabledAgents(scope, slug, enabledAgents);
}

export function resolveConflict(
  scope: SkillsWebScope,
  input: ResolveConflictInput,
): Promise<SkillRow> {
  return resolveWebSkillConflict(scope, input);
}
