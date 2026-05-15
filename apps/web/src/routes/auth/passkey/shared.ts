import { Buffer } from "node:buffer";
import { json, type Cookies } from "@sveltejs/kit";

import { loadBetterAuthPasskeyContext } from "@identity-access/application/auth/passkey-context.ts";
import type { PasskeyUser } from "@identity-access/application/auth/passkey.ts";

export const PASSKEY_LOGIN_CHALLENGE_COOKIE = "fulcrum.passkey_challenge";

type AuthContext = {
  internalAdapter: {
    createSession(userId: string): Promise<{ token: string }>;
    findUserById(userId: string): Promise<{
      id: string;
      email: string;
      name?: string | null;
    } | null>;
  };
  secret: string;
  authCookies?: {
    sessionToken?: {
      name?: string;
      attributes?: {
        maxAge?: number;
        path?: string;
        httpOnly?: boolean;
        sameSite?: "lax" | "strict" | "none" | "Lax" | "Strict" | "None";
        secure?: boolean;
      };
    };
  };
  sessionConfig?: {
    expiresIn?: number;
  };
};

let authContextPromise: Promise<AuthContext> | null = null;

export function rpIdFromUrl(url: URL): string {
  return url.hostname;
}

export function originFromUrl(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

export function passkeyError(error: unknown, fallback: string, status = 400): Response {
  const message = error instanceof Error ? error.message : fallback;
  const unavailable = message.includes("@simplewebauthn/server is not installed");
  return json({ verified: false, error: message }, { status: unavailable ? 503 : status });
}

export async function currentPasskeyUser(session: App.Locals["session"]): Promise<PasskeyUser | Response> {
  const userId = session?.userId;
  if (!userId) return json({ error: "Authentication required" }, { status: 401 });

  const context = await getAuthContext();
  const user = await context.internalAdapter.findUserById(userId);
  if (!user) return json({ error: "User not found" }, { status: 404 });

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? undefined,
  };
}

export function setLoginChallengeCookie(cookies: Cookies, challengeId: string, secure: boolean): void {
  cookies.set(PASSKEY_LOGIN_CHALLENGE_COOKIE, challengeId, {
    path: "/auth/passkey",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 5 * 60,
  });
}

export function clearLoginChallengeCookie(cookies: Cookies, secure: boolean): void {
  cookies.delete(PASSKEY_LOGIN_CHALLENGE_COOKIE, {
    path: "/auth/passkey",
    secure,
  });
}

export async function setBetterAuthSessionCookie(
  cookies: Cookies,
  url: URL,
  userId: string,
): Promise<void> {
  const context = await getAuthContext();
  const session = await context.internalAdapter.createSession(userId);
  const cookieName = context.authCookies?.sessionToken?.name ?? "better-auth.session_token";
  const attributes = context.authCookies?.sessionToken?.attributes ?? {};
  const value = await signedCookieValue(session.token, context.secret);

  cookies.set(cookieName, value, {
    path: attributes.path ?? "/",
    httpOnly: attributes.httpOnly ?? true,
    sameSite: lowerSameSite(attributes.sameSite) ?? "lax",
    secure: attributes.secure ?? url.protocol === "https:",
    maxAge: attributes.maxAge ?? context.sessionConfig?.expiresIn ?? 30 * 24 * 60 * 60,
  });
}

async function getAuthContext(): Promise<AuthContext> {
  if (!authContextPromise) {
    authContextPromise = loadBetterAuthPasskeyContext() as Promise<AuthContext>;
  }
  return authContextPromise;
}

async function signedCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return `${value}.${Buffer.from(signature).toString("base64")}`;
}

function lowerSameSite(
  value: "lax" | "strict" | "none" | "Lax" | "Strict" | "None" | undefined,
): "lax" | "strict" | "none" | undefined {
  if (!value) return undefined;
  return value.toLowerCase() as "lax" | "strict" | "none";
}
