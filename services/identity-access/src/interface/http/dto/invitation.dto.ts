import type { OrganizationRole } from "@identity-access/infrastructure/database/organization.entities.ts";

export class InvitationScopeDto {
  orgId!: string;
  userId!: string;
}

export class InvitationParamsDto {
  id!: string;
}

export class InvitationCreateDto extends InvitationScopeDto {
  email!: string;
  role!: OrganizationRole;
}
