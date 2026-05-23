export const UNSAVED_QUIT_MESSAGE = "Unsaved edits. Quit? (y/n)";

export type QuitConfirmationDecision = "confirm" | "quit" | "stay" | "idle";

export class QuitConfirmation {
  private pendingHint: string | null = null;

  request(hasUnsavedEdits: boolean, lossHint: string): QuitConfirmationDecision {
    if (!hasUnsavedEdits) return "quit";
    this.pendingHint = lossHint;
    return "confirm";
  }

  answer(key: string): QuitConfirmationDecision {
    if (!this.pendingHint) return "idle";
    if (key === "y" || key === "Y") {
      this.pendingHint = null;
      return "quit";
    }
    if (key === "n" || key === "N" || key === "\x1b") {
      this.pendingHint = null;
      return "stay";
    }
    return "confirm";
  }

  clear(): void {
    this.pendingHint = null;
  }

  get message(): string | null {
    return this.pendingHint ? UNSAVED_QUIT_MESSAGE : null;
  }

  get hint(): string | null {
    return this.pendingHint;
  }

  get isPending(): boolean {
    return this.pendingHint !== null;
  }
}
