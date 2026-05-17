/**
 * StatusBar widget — org name + user email + current screen + bell count badge.
 */

import pc from "picocolors";

export interface StatusBarOpts {
  orgName: string;
  userEmail: string;
  currentScreen: string;
  bellCount: number;
  width: number;
}

export class StatusBarWidget {
  private orgName: string;
  private userEmail: string;
  private currentScreen: string;
  private bellCount: number;
  private width: number;

  constructor(opts: StatusBarOpts) {
    this.orgName = opts.orgName;
    this.userEmail = opts.userEmail;
    this.currentScreen = opts.currentScreen;
    this.bellCount = opts.bellCount;
    this.width = opts.width;
  }

  setBellCount(count: number): void {
    this.bellCount = count;
  }

  setUserEmail(email: string): void {
    this.userEmail = email;
  }

  setCurrentScreen(screen: string): void {
    this.currentScreen = screen;
  }

  render(): string {
    const bell = this.bellCount > 0 ? ` 🔔${this.bellCount}` : "";
    const left = ` ${this.orgName} | ${this.userEmail} | ${this.currentScreen}`;
    const right = bell + " ";
    const space = Math.max(0, this.width - left.length - right.length);
    const bar = left + " ".repeat(space) + right;
    return pc.bgBlue(pc.white(bar.slice(0, this.width).padEnd(this.width)));
  }
}
