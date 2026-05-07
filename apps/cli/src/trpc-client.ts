export async function callProcedure<TInput extends object, TOutput>(
  procedure: string,
  input: TInput,
): Promise<TOutput> {
  const baseUrl = process.env["FULCRUM_TRPC_URL"] ?? "http://127.0.0.1:3000/trpc";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: input }),
  });
  if (!response.ok) {
    throw new Error(`${procedure} failed: HTTP ${response.status}`);
  }
  const body = await response.json() as unknown;
  return unwrapTrpcResponse<TOutput>(body);
}

function unwrapTrpcResponse<T>(body: unknown): T {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const result = record["result"];
    if (result && typeof result === "object") {
      const data = (result as Record<string, unknown>)["data"];
      if (data && typeof data === "object" && "json" in data) {
        return (data as Record<string, unknown>)["json"] as T;
      }
      return data as T;
    }
    if ("json" in record) return record["json"] as T;
  }
  return body as T;
}
