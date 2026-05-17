import type { OrganizationRole } from "@identity-access/infrastructure/database/organization.entities.ts";

export class AuthScopeDto {
  orgId!: string;
  userId!: string;
}

export class AuthInviteDto extends AuthScopeDto {
  email!: string;
  role!: OrganizationRole;
}

export class AuthAcceptInviteDto {
  token!: string;
}
