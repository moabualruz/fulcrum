/**
 * Install prompt manager for the pwa-offline feature gate.
 *
 * Captures the browser's `beforeinstallprompt` event and shows
 * the install banner after a configurable delay (default: 30 000 ms).
 */

// BeforeInstallPromptEvent is not in the standard TS lib: declare it.
declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  }
}

export type { BeforeInstallPromptEvent };

export class InstallPromptManager {
  private deferredEvent: BeforeInstallPromptEvent | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  /** Store the browser's deferred install event. */
  captureEvent(event: BeforeInstallPromptEvent): void {
    this.deferredEvent = event;
  }

  /**
   * Schedule `callback` to be invoked after `delayMs` (default 30 000 ms).
   * The callback is only called when an install event has been captured.
   * Clears any previously scheduled timer.
   */
  showAfterDelay(callback: () => void, delayMs = 30_000): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
    }
    this.timerId = setTimeout(() => {
      if (this.deferredEvent) {
        callback();
      }
    }, delayMs);
  }

  /** Programmatically trigger the native install prompt. */
  async prompt(): Promise<"accepted" | "dismissed" | null> {
    if (!this.deferredEvent) return null;
    await this.deferredEvent.prompt();
    const { outcome } = await this.deferredEvent.userChoice;
    this.deferredEvent = null;
    return outcome;
  }

  /** Cancel the scheduled timer. */
  cancel(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}

/** Singleton for the browser runtime. */
export const installPromptManager = new InstallPromptManager();
