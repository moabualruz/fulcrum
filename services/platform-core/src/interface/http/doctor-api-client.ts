export interface DoctorApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
}

export interface DoctorApiClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export function createDoctorApiCaller(options: DoctorApiClientOptions) {
  const request = doctorRequest(options);
  return {
    doctor: {
      run: async () => await request("/api/v1/doctor"),
      subsystems: async () => await request("/api/v1/doctor/subsystems"),
    },
  };
}

export function createDoctorApiCallerFromEnv(
  env: DoctorApiEnvironment = process.env as unknown as DoctorApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  if (!baseUrl) return null;
  return createDoctorApiCaller({ baseUrl, fetch: fetchFn });
}

function doctorRequest(options: DoctorApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(path: string): Promise<T> {
    const response = await fetchFn(new URL(path, baseUrl).toString(), {
      method: "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
    });
    const body = await parseResponseBody(response);
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string; json?: { message?: string } } } | null;
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Doctor API request failed with ${status}.`;
}
