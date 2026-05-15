import { Type, type Platform, type EntityProperty } from "typeorm";

export class VectorType extends Type<number[] | null, string | null> {
  override convertToDatabaseValue(value: number[] | null | undefined): string | null {
    if (value == null) return null;
    return JSON.stringify(value);
  }

  override convertToJSValue(value: string | number[] | null | undefined): number[] | null {
    if (value == null) return null;
    if (Array.isArray(value)) return value.map(Number);
    return JSON.parse(value) as number[];
  }

  override getColumnType(_prop: EntityProperty, _platform: Platform): string {
    return "text";
  }
}
