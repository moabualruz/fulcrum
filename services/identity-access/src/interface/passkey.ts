export {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@identity-access/application/auth/passkey.ts";
export type { PasskeyUser } from "@identity-access/application/auth/passkey.ts";
export type { BetterAuthPasskeyContext } from "@identity-access/application/auth/passkey-context.ts";

export async function loadBetterAuthPasskeyContext(): Promise<unknown> {
  const context = await import("@identity-access/application/auth/passkey-context.ts");
  return context.loadBetterAuthPasskeyContext();
}
