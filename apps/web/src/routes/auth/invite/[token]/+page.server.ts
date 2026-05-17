import { fail, redirect } from "@sveltejs/kit";

interface RouteLocals {
  session: unknown;
  orgId: string | null;
  activeProjectId: string | null;
}

interface LoadEvent {
  params: { token: string };
  locals: RouteLocals;
}

interface ActionEvent {
  params: { token: string };
  locals: RouteLocals;
  request: {
    formData(): Promise<FormData>;
    headers: { get(name: string): string | null };
  };
  url: URL;
  fetch: typeof fetch;
}

function extractApiError(body: unknown): string {
  if (!body || typeof body !== "object") return "Request failed";
  const b = body as Record<string, unknown>;
  const err = b["error"];
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e["message"] === "string") return e["message"];
  }
  if (typeof b["message"] === "string") return b["message"];
  return "Request failed";
}

async function acceptInvite(
  fetchFn: typeof fetch,
  baseUrl: string,
  token: string,
  extraHeaders?: Record<string, string>,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const response = await fetchFn(`${baseUrl}/api/v1/auth/accept-invite`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify({ token }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return { ok: false, error: extractApiError(body) };
    }

    return { ok: true, data: body };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function getBaseUrl(requestUrl: string): string {
  const u = new URL(requestUrl);
  return `${u.protocol}//${u.host}`;
}

export async function load(event: LoadEvent) {
  const { params, locals } = event;
  const token = params.token?.trim() ?? "";
  if (!token) {
    return {
      token: null as string | null,
      error: "Invalid or missing invitation token." as string | null,
      isAuthenticated: false,
    };
  }
  return {
    token,
    error: null as string | null,
    isAuthenticated: !!locals.session,
  };
}

export const actions = {
  default: async (event: ActionEvent) => {
    const { params, locals, request, url, fetch: fetchFn } = event;
    const token = params.token?.trim() ?? "";
    if (!token) {
      return fail(400, { error: "Missing invitation token.", token: "" });
    }

    const baseUrl = getBaseUrl(url.href);
    const isAuthenticated = !!locals.session;
    const form = await request.formData();

    if (isAuthenticated) {
      const cookieHeader = request.headers.get("cookie") ?? "";
      const acceptResult = await acceptInvite(
        fetchFn,
        baseUrl,
        token,
        { cookie: cookieHeader },
      );

      if (!acceptResult.ok) {
        return fail(400, { error: acceptResult.error, token });
      }

      throw redirect(302, "/");
    }

    const email = String(form.get("email") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const password = String(form.get("password") ?? "").trim();

    if (!email) {
      return fail(400, { error: "Email is required.", token, email: "", name });
    }
    if (!name) {
      return fail(400, { error: "Name is required.", token, email, name: "" });
    }
    if (!password) {
      return fail(400, { error: "Password is required.", token, email, name });
    }

    const signUpResponse = await fetchFn("/api/auth/sign-up/email", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });

    if (!signUpResponse.ok) {
      const signUpBody = await signUpResponse.json().catch(() => null);
      const msg = extractApiError(signUpBody) || "Could not create account";
      return fail(400, { error: msg, token, email, name });
    }

    const setCookie = signUpResponse.headers.get("set-cookie") ?? "";

    const acceptResult = await acceptInvite(
      fetchFn,
      baseUrl,
      token,
      setCookie ? { cookie: setCookie } : undefined,
    );

    if (!acceptResult.ok) {
      return fail(400, { error: acceptResult.error, token, email, name });
    }

    throw redirect(302, "/");
  },
};
