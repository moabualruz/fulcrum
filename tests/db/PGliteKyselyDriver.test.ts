/**
 * PGliteKyselyDriver — unit tests for the quote-aware SQL splitter.
 *
 * Regression coverage for the original split-on-';' bug: a column DEFAULT
 * containing a literal ';' inside a string would cause the driver to corrupt
 * the DDL by splitting it at the wrong position.
 *
 * C6: No plaintext SQL in app code — this test file validates the DRIVER-LAYER
 * tokenizer only; the SQL strings below are test inputs, not app queries.
 */

import { describe, it, expect } from "bun:test";
import { splitStatements } from "@platform-core/infrastructure/application-database/PGliteKyselyDriver.ts";

describe("splitStatements — basic cases", () => {
  it("splits simple multi-statement DDL on semicolons", () => {
    const sql = "CREATE TABLE a (id int); CREATE TABLE b (id int)";
    expect(splitStatements(sql)).toEqual([
      "CREATE TABLE a (id int)",
      "CREATE TABLE b (id int)",
    ]);
  });

  it("returns single statement without trailing semicolon", () => {
    const sql = "SELECT 1";
    expect(splitStatements(sql)).toEqual(["SELECT 1"]);
  });

  it("returns single statement with trailing semicolon", () => {
    const sql = "SELECT 1;";
    expect(splitStatements(sql)).toEqual(["SELECT 1"]);
  });

  it("returns empty array for empty input", () => {
    expect(splitStatements("")).toEqual([]);
    expect(splitStatements("   ")).toEqual([]);
    expect(splitStatements(";")).toEqual([]);
  });

  it("trims whitespace from each statement", () => {
    const sql = "  SELECT 1 ;  SELECT 2  ";
    expect(splitStatements(sql)).toEqual(["SELECT 1", "SELECT 2"]);
  });
});

describe("splitStatements — single-quoted string defaults (regression)", () => {
  it("does NOT split on semicolon inside single-quoted string default", () => {
    // This is the bug case: a column DEFAULT 'a;b' would previously be split
    // at the ';' inside the string, corrupting the DDL.
    const sql = "CREATE TABLE t (col text DEFAULT 'a;b')";
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toBe("CREATE TABLE t (col text DEFAULT 'a;b')");
  });

  it("does NOT split on multiple semicolons inside single-quoted string", () => {
    const sql = "CREATE TABLE t (col text DEFAULT 'a;b;c')";
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toBe("CREATE TABLE t (col text DEFAULT 'a;b;c')");
  });

  it("correctly splits statements where only one has a semicolon in a string", () => {
    const sql =
      "CREATE TABLE t (col text DEFAULT 'a;b'); CREATE TABLE u (id int)";
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toBe("CREATE TABLE t (col text DEFAULT 'a;b')");
    expect(stmts[1]).toBe("CREATE TABLE u (id int)");
  });

  it("handles escaped single-quotes ('' SQL escape) inside strings", () => {
    // 'it''s;a;test' is a SQL string containing "it's;a;test"
    const sql = "CREATE TABLE t (col text DEFAULT 'it''s;a;test')";
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toBe("CREATE TABLE t (col text DEFAULT 'it''s;a;test')");
  });
});

describe("splitStatements — double-quoted identifiers", () => {
  it("does NOT split on semicolon inside double-quoted identifier", () => {
    // Unusual but valid: quoted column name containing semicolon
    const sql = 'CREATE TABLE t ("col;name" text)';
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toBe('CREATE TABLE t ("col;name" text)');
  });
});

describe("splitStatements — dollar-quoted blocks", () => {
  it("does NOT split on semicolon inside $$ dollar-quoted block", () => {
    // PL/pgSQL function bodies use dollar quoting
    const sql =
      "CREATE FUNCTION f() RETURNS void AS $$ BEGIN; END; $$ LANGUAGE plpgsql";
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toBe(
      "CREATE FUNCTION f() RETURNS void AS $$ BEGIN; END; $$ LANGUAGE plpgsql",
    );
  });

  it("does NOT split on semicolon inside named dollar-quoted block", () => {
    const sql =
      "CREATE FUNCTION f() RETURNS void AS $body$ SELECT 1; $body$ LANGUAGE sql";
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toBe(
      "CREATE FUNCTION f() RETURNS void AS $body$ SELECT 1; $body$ LANGUAGE sql",
    );
  });

  it("splits correctly around dollar-quoted blocks", () => {
    const sql =
      "CREATE TABLE t (id int); CREATE FUNCTION f() RETURNS void AS $$ BEGIN; END; $$ LANGUAGE plpgsql";
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toBe("CREATE TABLE t (id int)");
    expect(stmts[1]).toBe(
      "CREATE FUNCTION f() RETURNS void AS $$ BEGIN; END; $$ LANGUAGE plpgsql",
    );
  });
});

describe("splitStatements — SQL comment handling (regression)", () => {
  it("does NOT split on semicolons inside a -- line comment", () => {
    // The '; with ; semicolons' after '--' must not be treated as boundaries.
    const sql = "CREATE TABLE x (\n  -- inline comment ; with ; semicolons\n  y int\n)";
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain("y int");
  });

  it("does NOT split on semicolons inside a /* block comment */", () => {
    const sql = "CREATE TABLE x (/* multi ; line ; comment */ y int)";
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toBe("CREATE TABLE x (/* multi ; line ; comment */ y int)");
  });

  it("does NOT treat '--' inside a single-quoted string as a comment start", () => {
    // The '--' is inside the string literal; ';' after the string IS a real boundary.
    const sql = "CREATE TABLE x (y text DEFAULT 'a -- b'); CREATE TABLE z (id int)";
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toBe("CREATE TABLE x (y text DEFAULT 'a -- b')");
    expect(stmts[1]).toBe("CREATE TABLE z (id int)");
  });

  it("does NOT treat quotes inside /* */ block comments as string delimiters", () => {
    // 'quotes' inside the comment should not open/close a string context.
    const sql = "CREATE TABLE x (/* contains 'quotes' */ y int)";
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toBe("CREATE TABLE x (/* contains 'quotes' */ y int)");
  });

  it("handles mixed quotes and comment forms in a single DDL string", () => {
    // Multi-statement DDL combining: string default, line comment, block comment.
    const sql = [
      "CREATE TABLE a (col text DEFAULT 'val;ue')",
      "/* block ; comment */ CREATE TABLE b (id int)",
      "CREATE TABLE c (\n  -- line ; comment\n  val int\n)",
    ].join(";\n");
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(3);
    expect(stmts[0]).toBe("CREATE TABLE a (col text DEFAULT 'val;ue')");
    expect(stmts[1]).toBe("/* block ; comment */ CREATE TABLE b (id int)");
    expect(stmts[2]).toContain("val int");
  });
});

describe("splitStatements — MikroORM schema generator output patterns", () => {
  it("handles gen_random_uuid() default without corruption", () => {
    // Actual MikroORM DDL output for a UUID primary key
    const sql =
      'create table "users" ("id" uuid not null default gen_random_uuid(), "email" varchar(255) not null)';
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain("gen_random_uuid()");
  });

  it("handles now() default without corruption", () => {
    const sql =
      'create table "users" ("created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now())';
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
  });

  it("handles multi-statement schema DDL", () => {
    // Simulates MikroORM emitting multiple CREATE TABLE statements
    const sql = [
      'create table "users" ("id" uuid not null default gen_random_uuid())',
      'create table "sessions" ("id" varchar(255) not null)',
      'create index "idx_users" on "users" ("org_id", "email")',
    ].join(";\n");
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(3);
    expect(stmts[0]).toContain('"users"');
    expect(stmts[1]).toContain('"sessions"');
    expect(stmts[2]).toContain('"idx_users"');
  });
});
