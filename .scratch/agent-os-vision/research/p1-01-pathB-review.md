SPEC: FAIL
QUALITY: CHANGES_REQUIRED

Commit reviewed: 984b496b401bf5a3ab964042ebaae4590c6421c7

Verdict: Path B decorator-class rewrite is mostly present, but the required PGlite splitter verification fails for SQL line comments and block comments. Clean-code sweep also found a stale C6 test header comment that contradicts the actual ORM setup/persistence code.

## Per-Fix Verification Table

| Fix# | Status | File:Line | Evidence |
|---|---|---|---|
| 1 | PASS | `src/db/entities/auth/User.ts:13-26`, `Session.ts:12-23`, `Invitation.ts:12-24`, `OrgMember.ts:12-25`, `FeatureFlag.ts:16-28` | All five entity files import from `@mikro-orm/decorators/es` and declare decorator classes. `User.ts:23` has `@Entity({ tableName: "users", repository: () => UserRepository })`; equivalent class decorators are at `Session.ts:20`, `Invitation.ts:21`, `OrgMember.ts:21`, `FeatureFlag.ts:25`. Properties have explicit decorator `type` refs, e.g. `User.ts:27-49`, `Session.ts:25-48`, `Invitation.ts:25-51`, `OrgMember.ts:26-39`, `FeatureFlag.ts:29-48`. |
| 2 | PASS | `src/db/entities/auth/User.ts:23`, `Session.ts:20`, `Invitation.ts:21`, `OrgMember.ts:21`, `FeatureFlag.ts:25`; `tests/db/auth/auth-entities.test.ts:421-444` | Each `@Entity` includes `repository: () => XxxRepository`. Test diff verifies the runtime repository subclass for all five entities with `toBeInstanceOf` at lines 423, 428, 433, 438, 443. Note: commit body says "10 new isinstance assertions"; diff shows 5 `toBeInstanceOf` assertions, one per entity. |
| 3 | PASS | `src/db/db.module.ts:24-45`, `src/db/db.module.ts:73-91` | `db.module.ts` imports entity classes and custom repository classes, re-exports the repositories, and binds `provide: UserRepository`/`SessionRepository`/`InvitationRepository`/`OrgMemberRepository`/`FeatureFlagRepository` to `em.getRepository(Entity) as XxxRepository`. |
| 4 | PASS | `tests/db/auth/auth-entities.test.ts:43-53`, `tests/db/auth/auth-entities.test.ts:261-271`, `288-296`, `312-321`, `335-342`, `356-363` | Auth entity test setup uses `MikroORM.init` with entity classes and `await orm.schema.create()`. Fixtures use `em.create(...)`, `em.persist(...)`, and `await em.flush()` for each entity. The only `CREATE TABLE` text visible in the post-image refs here is explanatory comment text at line 52; setup and fixtures are ORM calls at the cited lines. |
| 5 | FAIL | `src/db/PGliteKyselyDriver.ts:29-146`; `tests/db/PGliteKyselyDriver.test.ts:46-122` | Quote-aware tokenizer handles single quotes, double quotes, and dollar-quoted blocks, with tests for those cases. It does not handle `--` line comments, and it explicitly says C-style block comments are not tracked at lines 37-38. The unconditional statement boundary at lines 124-132 splits on any `;` that is not inside the three quote branches, so semicolons inside line/block comments can still split statements. |
| 6 | PASS | `tsconfig.json:23-24` | `experimentalDecorators` is explicitly `false`, `useDefineForClassFields` is `true`; no Stage-3 + legacy `experimentalDecorators: true` conflict. Tests are included at `tsconfig.json:26`. |

## Scope Check Result

Conditional PASS under inferred Path B support scope. `git show --format= --name-only 984b496` lists only: issue tracker metadata, dependency files (`package.json`, `bun.lock`), DB driver/module/config/entity/repository files, DB tests, and `tsconfig.json`.

Touched paths:

```text
.scratch/agent-os-vision/01-foundation-reset/issues/01-schema-auth-migration.md
bun.lock
package.json
src/db/PGliteKyselyDriver.ts
src/db/db.module.ts
src/db/entities/auth/FeatureFlag.ts
src/db/entities/auth/Invitation.ts
src/db/entities/auth/OrgMember.ts
src/db/entities/auth/Session.ts
src/db/entities/auth/User.ts
src/db/entities/auth/index.ts
src/db/mikro-orm.config.ts
src/db/repositories/auth/FeatureFlagRepository.ts
src/db/repositories/auth/InvitationRepository.ts
src/db/repositories/auth/OrgMemberRepository.ts
src/db/repositories/auth/SessionRepository.ts
src/db/repositories/auth/UserRepository.ts
tests/db/PGliteKyselyDriver.test.ts
tests/db/auth/auth-entities.test.ts
tsconfig.json
```

If the allowed path set is interpreted as only the six files/groups named in the task, then `package.json`, `bun.lock`, `src/db/entities/auth/index.ts`, `src/db/mikro-orm.config.ts`, the five repository files, `tests/db/PGliteKyselyDriver.test.ts`, and the `.scratch/.../issues/...md` metadata update are extra. They are explainable support files for the decorator dependency, class exports/config wiring, repository typing, regression coverage, and issue bookkeeping, but no explicit allowlist was provided in the prompt.

## C6 / Clean-Code Sweep

CHANGES_REQUIRED:

- `tests/db/auth/auth-entities.test.ts:8-9` says schema setup uses `orm.schema.refreshDatabase()` and fixtures use `em.persistAndFlush`, but actual setup uses `await orm.schema.create()` at line 53 and actual fixture writes use `em.persist(...)` + `await em.flush()` at lines 270-271, 295-296, 320-321, 341-342, 362-363. Fix stale comment.
- `src/db/PGliteKyselyDriver.ts:37-38` documents block comments as not tracked while this review explicitly requires block comments to be handled. This is not just a comment issue: the semicolon boundary at lines 124-132 still fires inside comments.

No C6 issue found in the auth entity test raw SQL replacement hunk: `tests/db/auth/auth-entities.test.ts:51-53` uses ORM-generated DDL, and fixture writes use ORM persistence at `tests/db/auth/auth-entities.test.ts:261-271`, `288-296`, `312-321`, `335-342`, `356-363`.

Driver-layer SQL strings in `tests/db/PGliteKyselyDriver.test.ts:17-148` are test inputs for the tokenizer; file header scopes them as driver-layer tokenizer inputs at lines 8-9. Production `src/db/PGliteKyselyDriver.ts:164`, `173`, `205`, `209`, `213` contains driver bridge execution/transaction primitives (`pglite.exec`, `pglite.query`, `CQ.raw("BEGIN")`, `CQ.raw("COMMIT")`, `CQ.raw("ROLLBACK")`), not app-level raw SQL queries.

## PGliteKyselyDriver Quote-Awareness Verdict

Verdict: PARTIAL / FAIL for requested coverage.

Pass:

- Single-quoted strings with semicolons (`'...;...'`): handled by `src/db/PGliteKyselyDriver.ts:50-69`; tested at `tests/db/PGliteKyselyDriver.test.ts:46-78`.
- Double-quoted strings / identifiers with semicolons (`"...;..."`): handled by `src/db/PGliteKyselyDriver.ts:71-90`; tested at `tests/db/PGliteKyselyDriver.test.ts:81-88`.
- Dollar-quoted blocks (`$$...;...$$`, `$body$...;...$body$`): handled by `src/db/PGliteKyselyDriver.ts:92-122`; tested at `tests/db/PGliteKyselyDriver.test.ts:91-122`.

Fail:

- Line comments (`-- ... ;`): no branch handles `--`; after quote/dollar checks, `src/db/PGliteKyselyDriver.ts:124-132` treats `;` as a boundary.
- Block comments (`/* ... ; ... */`): explicitly not tracked at `src/db/PGliteKyselyDriver.ts:37-38`; `src/db/PGliteKyselyDriver.ts:124-132` treats `;` inside the comment as a boundary.

Quoted split-statements logic from `src/db/PGliteKyselyDriver.ts:29-146`:

```ts
/**
 * Quote-aware SQL statement splitter.
 *
 * Splits a multi-statement DDL string into individual statements, correctly
 * handling single-quoted strings ('…'), double-quoted identifiers ("…"), and
 * dollar-quoted blocks ($tag$…$tag$).  A semicolon that appears inside any of
 * these quoting forms is NOT treated as a statement boundary.
 *
 * Limitations: C-style block comments (/* … *\/) are not tracked, but MikroORM's
 * schema generator never emits them, so this is a non-issue for our use-case.
 *
 * @returns Array of trimmed, non-empty SQL statements (without trailing `;`).
 */
export function splitStatements(sql: string): string[] {
  const stmts: string[] = [];
  let current = "";
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i]!;

    // Single-quoted string literal: scan until closing ' (handle '' escapes)
    if (ch === "'") {
      current += ch;
      i++;
      while (i < sql.length) {
        const c = sql[i]!;
        current += c;
        i++;
        if (c === "'") {
          // Check for escaped quote '' — if next char is also ' it's an escape
          if (sql[i] === "'") {
            current += sql[i]!;
            i++;
          } else {
            break; // closing quote
          }
        }
      }
      continue;
    }

    // Double-quoted identifier: scan until closing "
    if (ch === '"') {
      current += ch;
      i++;
      while (i < sql.length) {
        const c = sql[i]!;
        current += c;
        i++;
        if (c === '"') {
          // Handle "" escape inside identifier
          if (sql[i] === '"') {
            current += sql[i]!;
            i++;
          } else {
            break;
          }
        }
      }
      continue;
    }

    // Dollar-quoted block: $tag$…$tag$ where tag may be empty ($$ … $$)
    if (ch === "$") {
      // Try to read the dollar-quote tag: $[A-Za-z0-9_]*$
      let tag = "$";
      let j = i + 1;
      while (j < sql.length && sql[j] !== "$" && /\w/.test(sql[j]!)) {
        tag += sql[j]!;
        j++;
      }
      if (j < sql.length && sql[j] === "$") {
        tag += "$"; // complete the opening tag, e.g. "$$" or "$body$"
        const closeTag = tag;
        current += tag;
        i = j + 1;
        // Scan for the matching closing tag
        while (i < sql.length) {
          const closeIdx = sql.indexOf(closeTag, i);
          if (closeIdx === -1) {
            // No closing tag found — consume rest of string (malformed SQL)
            current += sql.slice(i);
            i = sql.length;
            break;
          }
          current += sql.slice(i, closeIdx + closeTag.length);
          i = closeIdx + closeTag.length;
          break;
        }
        continue;
      }
      // Not a dollar-quote — fall through as regular character
    }

    // Statement boundary
    if (ch === ";") {
      const stmt = current.trim();
      if (stmt.length > 0) {
        stmts.push(stmt);
      }
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  // Handle final statement without trailing semicolon
  const remaining = current.trim();
  if (remaining.length > 0) {
    stmts.push(remaining);
  }

  return stmts;
}
```

## tsconfig.json Verdict

PASS. `tsconfig.json:23` sets `"experimentalDecorators": false`, and `tsconfig.json:24` sets `"useDefineForClassFields": true`. That satisfies Stage-3-only config: no absent/true ambiguity, no legacy experimental decorator mode, no Stage-3 + `experimentalDecorators: true` conflict.

## Open Questions

- Exact allowed-path allowlist was not included in the prompt. Scope result above uses inferred Path B support scope and calls out extras under a strict six-bullet interpretation.
