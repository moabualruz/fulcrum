export class SkillSupplyListQueryDto {
  orgId?: string;
}

export class SkillSupplyInstallDto {
  path!: string;
}

export class SkillSupplyUpgradeDto {
  slug!: string;
}

export class SkillSupplySyncDto {
  fetchUpstream!: boolean;
}

export class SkillSupplyResolveConflictDto {
  slug!: string;
  resolution!: "local" | "upstream" | "editor";
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
