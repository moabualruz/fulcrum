/**
 * FilterChips — add/remove facet chips, Tab cycle, Enter apply.
 */

import pc from "picocolors";

export class FilterChips {
  private _chips: string[] = [];
  private _focusedIndex = 0;

  get chips(): string[] {
    return [...this._chips];
  }

  get focusedIndex(): number {
    return this._focusedIndex;
  }

  addChip(chip: string): void {
    if (!this._chips.includes(chip)) {
      this._chips.push(chip);
    }
  }

  removeChip(chip: string): void {
    const idx = this._chips.indexOf(chip);
    if (idx !== -1) {
      this._chips.splice(idx, 1);
      if (this._focusedIndex >= this._chips.length) {
        this._focusedIndex = Math.max(0, this._chips.length - 1);
      }
    }
  }

  handleKey(key: string): void {
    if (key === "tab" && this._chips.length > 0) {
      this._focusedIndex = (this._focusedIndex + 1) % this._chips.length;
    }
  }

  /** Render chips as a single line. */
  render(): string {
    if (this._chips.length === 0) return "";
    return this._chips
      .map((chip, i) => {
        const label = ` ${chip} `;
        return i === this._focusedIndex
          ? pc.inverse(label)
          : pc.dim("[") + chip + pc.dim("]");
      })
      .join("  ");
  }
}
