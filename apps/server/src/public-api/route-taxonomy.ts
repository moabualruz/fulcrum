export const PUBLIC_API_VERSION = "v1";
export const PUBLIC_API_PREFIX = `/api/${PUBLIC_API_VERSION}`;
export const WORKFLOW_API_PREFIX = "/workflows";
export const EVENT_STREAM_PREFIX = `${PUBLIC_API_PREFIX}/events`;
export const WEBHOOK_API_PREFIX = `${PUBLIC_API_PREFIX}/webhooks`;
export const WEB_TRPC_BRIDGE_PREFIX = "/api/trpc";
export const TRPC_EXPRESS_MOUNT_PATH = "/trpc";

export type RouteNamespaceName =
  | "public-rest"
  | "workflow-http"
  | "event-stream"
  | "webhook"
  | "web-trpc-bridge"
  | "internal-trpc"
  | "internal-web"
  | "internal-runtime";

export type RouteStability = "stable" | "typed-internal" | "internal";
export type RouteTransport = "http-json" | "sse" | "trpc";

export interface RouteNamespace {
  name: RouteNamespaceName;
  prefix: string;
  transport: RouteTransport;
  stability: RouteStability;
  public: boolean;
  lifecycle: string;
  clients: string[];
}

export interface RouteVersioningPolicy {
  currentVersion: typeof PUBLIC_API_VERSION;
  stablePrefixes: string[];
  deprecationHeaders: string[];
  policy: string;
}

export const ROUTE_VERSIONING_POLICY: RouteVersioningPolicy = {
  currentVersion: PUBLIC_API_VERSION,
  stablePrefixes: [PUBLIC_API_PREFIX, WORKFLOW_API_PREFIX],
  deprecationHeaders: ["Deprecation", "Sunset", "Link"],
  policy:
    "Stable public HTTP routes are versioned under /api/v1 or explicitly scoped under /workflows. Breaking changes require a new versioned prefix; soft deprecations publish Deprecation, Sunset, and Link headers plus OpenAPI x-fulcrum-deprecation-policy metadata.",
};

export const ROUTE_NAMESPACES: RouteNamespace[] = [
  {
    name: "event-stream",
    prefix: EVENT_STREAM_PREFIX,
    transport: "sse",
    stability: "stable",
    public: true,
    lifecycle: "versioned event contracts with reconnect and backpressure headers",
    clients: ["CLI watch commands", "TUI live status", "web live updates"],
  },
  {
    name: "webhook",
    prefix: WEBHOOK_API_PREFIX,
    transport: "http-json",
    stability: "stable",
    public: true,
    lifecycle: "versioned integration management routes; delivery targets are external URLs, not runtime command routes",
    clients: ["external integrations", "settings web surface", "CLI integration commands"],
  },
  {
    name: "public-rest",
    prefix: PUBLIC_API_PREFIX,
    transport: "http-json",
    stability: "stable",
    public: true,
    lifecycle: "versioned public product API",
    clients: ["HTTP clients", "web server actions", "CLI fallback", "TUI fallback"],
  },
  {
    name: "workflow-http",
    prefix: WORKFLOW_API_PREFIX,
    transport: "http-json",
    stability: "stable",
    public: true,
    lifecycle: "workflow orchestration API namespace; clients use workflow API wrappers",
    clients: ["workflow orchestrators", "web workflow pages", "CLI workflow commands"],
  },
  {
    name: "web-trpc-bridge",
    prefix: WEB_TRPC_BRIDGE_PREFIX,
    transport: "trpc",
    stability: "typed-internal",
    public: false,
    lifecycle: "SvelteKit web bridge only; CLI/TUI use AppCaller or public REST instead of treating this as stable HTTP",
    clients: ["web UI"],
  },
  {
    name: "internal-trpc",
    prefix: TRPC_EXPRESS_MOUNT_PATH,
    transport: "trpc",
    stability: "typed-internal",
    public: false,
    lifecycle: "Nest-mounted tRPC runtime for typed in-process/server clients",
    clients: ["AppCaller", "server tests"],
  },
  {
    name: "internal-web",
    prefix: "/api",
    transport: "http-json",
    stability: "internal",
    public: false,
    lifecycle: "SvelteKit route handlers for browser-local behavior; not an external API contract",
    clients: ["web UI"],
  },
  {
    name: "internal-runtime",
    prefix: "/internal",
    transport: "http-json",
    stability: "internal",
    public: false,
    lifecycle: "runtime health and diagnostics only",
    clients: ["doctor", "local runtime"],
  },
];

export function classifyRoutePath(path: string): RouteNamespace {
  const normalized = normalizeRoutePath(path);
  const namespace = ROUTE_NAMESPACES.find((candidate) =>
    normalized === candidate.prefix || normalized.startsWith(`${candidate.prefix}/`)
  );
  return namespace ?? ROUTE_NAMESPACES[ROUTE_NAMESPACES.length - 1]!;
}

export function isStablePublicRoute(path: string): boolean {
  const namespace = classifyRoutePath(path);
  return namespace.public && namespace.stability === "stable";
}

export function assertStablePublicRouteIsVersioned(path: string): void {
  const normalized = normalizeRoutePath(path);
  const namespace = classifyRoutePath(path);
  if (namespace.name === "internal-runtime" && !normalized.startsWith("/internal")) {
    throw new Error(`Stable public route must use a documented versioned prefix: ${path}`);
  }
  if (!namespace.public) return;
  if (ROUTE_VERSIONING_POLICY.stablePrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) return;
  throw new Error(`Stable public route must use a documented versioned prefix: ${path}`);
}

export function createRouteTaxonomyMetadata(): Record<string, unknown> {
  return {
    versioning: ROUTE_VERSIONING_POLICY,
    namespaces: ROUTE_NAMESPACES,
  };
}

export function attachRouteTaxonomyMetadata(document: unknown): void {
  if (!document || typeof document !== "object") return;
  const openApiDocument = document as Record<string, unknown>;
  const info = typeof openApiDocument["info"] === "object" && openApiDocument["info"] !== null
    ? openApiDocument["info"] as Record<string, unknown>
    : {};

  info["x-fulcrum-route-taxonomy"] = createRouteTaxonomyMetadata();
  info["x-fulcrum-deprecation-policy"] = ROUTE_VERSIONING_POLICY;
  openApiDocument["info"] = info;
}

function normalizeRoutePath(path: string): string {
  const [pathname] = path.split("?");
  const withSlash = pathname?.startsWith("/") ? pathname : `/${pathname ?? ""}`;
  return withSlash.replace(/\/+$/, "") || "/";
}
