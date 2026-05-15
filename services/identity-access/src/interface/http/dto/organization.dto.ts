import type { OrganizationRole } from "@identity-access/infrastructure/database/organization.entities.ts";

export class OrganizationScopeDto {
  orgId!: string;
  userId!: string;
}

export class OrganizationUpdateDto extends OrganizationScopeDto {
  name!: string;
}

export class OrganizationMemberParamsDto {
  userId!: string;
}

export class OrganizationMemberRoleDto extends OrganizationScopeDto {
  role!: OrganizationRole;
}
