const SENSITIVE_EXPORT_COLUMNS = new Set([
  "apikey",
  "encryptedvalue",
  "password",
  "secret",
  "token",
]);

function normalizeColumnName(column: string): string {
  return column.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveExportColumn(column: string): boolean {
  return SENSITIVE_EXPORT_COLUMNS.has(normalizeColumnName(column));
}

export function exportableColumns(columns: string[]): string[] {
  return columns.filter((column) => !isSensitiveExportColumn(column));
}

export function redactExportRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([column]) => !isSensitiveExportColumn(column)),
  );
}
