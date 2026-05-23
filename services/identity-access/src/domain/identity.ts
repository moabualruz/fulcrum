import type { Session } from "better-auth";

export interface AuthApplicationContext {
  orgId: string;
  userId: string;
  session: Session;
}

export interface SessionContextDto {
  userId: string;
  orgId: string;
  activeOrgId: string;
  sessionId: string;
  sessionExpiresAt: string | null;
  email: string | null;
  role: string | null;
  orgName?: string;
  passkeyCount?: number;
}

export interface InviteInput {
  email: string;
  role: "owner" | "admin" | "member" | "guest";
}

export interface InviteOutput {
  invitationId: string;
  token: string;
}

export interface AcceptInviteInput {
  token: string;
  name?: string;
}

export interface AcceptInviteOutput {
  userId: string;
  orgId: string;
}
