/**
 * Screen registry for the TUI foundation.
 *
 * Lightweight, in-memory registry mapping screen-key → metadata. Used by the
 * launcher and router to ensure every navigable surface is named, titled, and
 * uniquely registered. Future renderer integration (OpenTUI swap, gated by
 * T15-75 snapshot gate) will consume this to wire React-tree mounting.
 *
 * P15#01 — foundation parity.
 */

export interface ScreenDescriptor {
  /** Stable screen key — used for telemetry, history stack, route lookup. */
  key: string;
  /** Human title — appears in status bar / breadcrumb. */
  title: string;
  /** Optional pillar attribution (e.g. "P3", "P4"). */
  pillar?: string;
}

export class ScreenRegistry {
  private readonly screens = new Map<string, ScreenDescriptor>();
  private readonly order: string[] = [];

  register(descriptor: ScreenDescriptor): void {
    if (this.screens.has(descriptor.key)) {
      throw new Error(`Screen "${descriptor.key}" already registered.`);
    }
    this.screens.set(descriptor.key, descriptor);
    this.order.push(descriptor.key);
  }

  get(key: string): ScreenDescriptor | undefined {
    return this.screens.get(key);
  }

  has(key: string): boolean {
    return this.screens.has(key);
  }

  list(): readonly ScreenDescriptor[] {
    return this.order.map((k) => this.screens.get(k)!).filter(Boolean);
  }

  size(): number {
    return this.screens.size;
  }
}
