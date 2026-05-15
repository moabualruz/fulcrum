/**
 * VectorType — TypeORM custom column type for pgvector / JSON-serialized float arrays.
 * Stores number[] as a JSON string in a "text" column.
 */
export class VectorType {
  convertToDatabaseValue(value: number[] | null | undefined): string | null {
    if (value == null) return null;
    return JSON.stringify(value);
  }

  convertToJSValue(value: string | number[] | null | undefined): number[] | null {
    if (value == null) return null;
    if (Array.isArray(value)) return value.map(Number);
    return JSON.parse(value) as number[];
  }

  getColumnType(): string {
    return "text";
  }
}
