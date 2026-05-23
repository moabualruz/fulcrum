export class SkillSupplyListQueryDto {
  orgId?: string;
}

export class SkillSupplyInstallDto {
  path!: string;
  forceConflict?: boolean;
  conflictResolution?: "alt-version" | "skip" | "upgrade-installed";
}

export class SkillSupplyUpgradeDto {
  slug!: string;
}

export class SkillSupplySyncDto {
  fetchUpstream?: boolean;
}

export class SkillSupplyResolveConflictDto {
  slug!: string;
  resolution!: "local" | "upstream" | "editor" | "force" | "alt-version" | "skip" | "upgrade-installed";
  altVersion?: string;
}

export class SkillSupplyOverrideConflictDto {
  conflictId!: string;
  resolution!: "local" | "upstream";
  auditNote?: string;
}

export class SkillSupplyOverrideLockDto {
  slug!: string;
  expectedSha256!: string;
  actualSha256!: string;
  auditNote?: string;
}
