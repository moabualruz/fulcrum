export interface TuiRoute {
  path: string;
  screenKey: string;
  title: string;
  render: () => string | void;
}

export interface TuiRouterOptions {
  routes: readonly TuiRoute[];
  maxHistory?: number;
}

const FALLBACK_SCREEN_KEY = "not-found";

export class TuiRouter {
  private readonly routes = new Map<string, TuiRoute>();
  private readonly maxHistory: number;
  private readonly fallbackRoute: TuiRoute;
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

  private pushHistory(route: TuiRoute): void {
    this.previousRoutes.push(route);
    if (this.previousRoutes.length > this.maxHistory) {
      this.previousRoutes = this.previousRoutes.slice(-this.maxHistory);
    }
  }
}
