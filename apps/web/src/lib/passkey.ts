interface BrowserWebAuthn {
  startRegistration: (params: { optionsJSON: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  startAuthentication: (params: { optionsJSON: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  browserSupportsWebAuthn?: () => boolean;
}

export interface PasskeyClientResult {
  verified: boolean;
  error?: string;
  userId?: string;
}

export function browserSupportsPasskeys(): boolean {
  if (typeof window === "undefined") return false;
  if (!("PublicKeyCredential" in window)) return false;
  return typeof navigator !== "undefined" && !!navigator.credentials;
}

export async function registerPasskey(): Promise<PasskeyClientResult> {
  if (!browserSupportsPasskeys()) {
    return { verified: false, error: "Passkeys are not available in this browser" };
  }

  try {
    const browser = await importSimpleWebAuthnBrowser();
    if (browser.browserSupportsWebAuthn && !browser.browserSupportsWebAuthn()) {
      return { verified: false, error: "Passkeys are not available in this browser" };
    }

    const options = await postJson("/auth/passkey/register/options");
    const credential = await browser.startRegistration({ optionsJSON: options });
    return await postJson<PasskeyClientResult>("/auth/passkey/register/verify", credential);
  } catch (error) {
    return { verified: false, error: passkeyErrorMessage(error, "Could not register passkey") };
  }
}

export async function signInWithPasskey(): Promise<PasskeyClientResult> {
  if (!browserSupportsPasskeys()) {
    return { verified: false, error: "Passkeys are not available in this browser" };
  }

  try {
    const browser = await importSimpleWebAuthnBrowser();
    if (browser.browserSupportsWebAuthn && !browser.browserSupportsWebAuthn()) {
      return { verified: false, error: "Passkeys are not available in this browser" };
    }

    const options = await postJson("/auth/passkey/login/options");
    const credential = await browser.startAuthentication({ optionsJSON: options });
    return await postJson<PasskeyClientResult>("/auth/passkey/login/verify", credential);
  } catch (error) {
    return { verified: false, error: passkeyErrorMessage(error, "Could not sign in with passkey") };
  }
}

async function importSimpleWebAuthnBrowser(): Promise<BrowserWebAuthn> {
  return await new Function("s", "return import(s)")("@simplewebauthn/browser") as BrowserWebAuthn;
}

async function postJson<T = Record<string, unknown>>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readPayloadError(payload) ?? response.statusText);
  return payload as T;
}

function readPayloadError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  if ("error" in payload && typeof payload.error === "string") return payload.error;
  if ("message" in payload && typeof payload.message === "string") return payload.message;
  return null;
}

function passkeyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return fallback;
}
