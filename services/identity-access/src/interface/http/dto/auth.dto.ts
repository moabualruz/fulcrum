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

export class AuthEmailVerificationRequestDto extends AuthScopeDto {
  email?: string;
  baseUrl?: string;
}

export class AuthEmailVerificationConfirmDto {
  token!: string;
}

export class AuthSessionsQueryDto extends AuthScopeDto {
  currentSessionId?: string;
}

export class AuthSessionRevokeDto extends AuthSessionsQueryDto {
  sessionId!: string;
}
