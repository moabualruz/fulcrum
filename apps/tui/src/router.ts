import {
  buildTuiScreenRegistry,
  resolveColonRoute,
  type ScreenRegistry,
} from "./screen-registry.ts";

export interface TuiRoute {
  path: string;
  screenKey: string;
  title: string;
  render: () => string | void;
}

export interface TuiRouterOptions {
  routes: readonly TuiRoute[];
  maxHistory?: number;
  /**
   * Canonical screen catalog. When provided, colon routes (`:capture`, `:plan`,
   * …) resolve through it. Defaults to {@link buildTuiScreenRegistry}.
   */
  screenRegistry?: ScreenRegistry;
}

const FALLBACK_SCREEN_KEY = "not-found";

export class TuiRouter {
  private readonly routes = new Map<string, TuiRoute>();
  private readonly maxHistory: number;
  private readonly fallbackRoute: TuiRoute;
  private readonly screenRegistry: ScreenRegistry;
  private currentRoute: TuiRoute;
  private previousRoutes: TuiRoute[] = [];

  constructor(opts: TuiRouterOptions) {
    if (opts.routes.length === 0) {
      throw new Error("TuiRouter requires at least one route.");
    }

    for (const route of opts.routes) {
      this.routes.set(route.path, route);
    }

    this.maxHistory = opts.maxHistory ?? 5;
    this.screenRegistry = opts.screenRegistry ?? buildTuiScreenRegistry();
    this.currentRoute = opts.routes[0]!;
    this.fallbackRoute = {
      path: "*",
      screenKey: FALLBACK_SCREEN_KEY,
      title: "Not Found",
      render: () => `Unknown route: ${this.currentRoute.path}`,
    };
  }

  navigate(path: string): TuiRoute {
    this.pushHistory(this.currentRoute);
    this.currentRoute = this.routes.get(path) ?? {
      ...this.fallbackRoute,
      path,
      render: () => `Unknown route: ${path}`,
    };
    return this.currentRoute;
  }

  /**
   * Resolve a colon route (`:capture`, `:plan`, `:runs`, `:board`, `:review`,
   * `:ship`, `:doctor`, `:ai`, …) to a registered screen key. Returns the
   * screen key when the colon route maps to a known screen, otherwise
   * `undefined`: the caller renders a not-found screen rather than crashing.
   */
  resolveColon(route: string): string | undefined {
    const screenKey = resolveColonRoute(route);
    if (!screenKey) return undefined;
    return this.screenRegistry.has(screenKey) ? screenKey : undefined;
  }

  /** Whether the screen catalog knows this screen key. */
  hasScreen(screenKey: string): boolean {
    return this.screenRegistry.has(screenKey);
  }

  goBack(): TuiRoute {
    const previous = this.previousRoutes.pop();
    if (previous) this.currentRoute = previous;
    return this.currentRoute;
  }

  render(): string {
    return this.currentRoute.render() ?? "";
  }

  get current(): TuiRoute {
    return this.currentRoute;
  }

  get history(): readonly TuiRoute[] {
    return this.previousRoutes;
  }

  /** The canonical screen catalog backing colon-route resolution. */
  get registry(): ScreenRegistry {
    return this.screenRegistry;
  }

  private pushHistory(route: TuiRoute): void {
    this.previousRoutes.push(route);
    if (this.previousRoutes.length > this.maxHistory) {
      this.previousRoutes = this.previousRoutes.slice(-this.maxHistory);
    }
  }
}
