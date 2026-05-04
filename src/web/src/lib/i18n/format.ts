/**
 * Intl.DateTimeFormat / Intl.NumberFormat helpers per locale.
 */

/**
 * Format a date per locale using Intl.DateTimeFormat.
 * e.g. ar → Arabic locale date formatting
 */
export function formatDate(
  date: Date | string | number,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale, options ?? { dateStyle: "medium" }).format(d);
}

/**
 * Format a number per locale using Intl.NumberFormat.
 */
export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}
