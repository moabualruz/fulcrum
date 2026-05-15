import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
  CallExpression,
  Node,
  ObjectLiteralExpression,
  Project,
  SourceFile,
  VariableDeclaration,
} from "ts-morph";
import { z } from "zod";

export type FlagType = "string" | "number" | "boolean" | "enum";

export type FlagDefinition = {
  name: string;
  flag: string;
  type: FlagType;
  required: boolean;
  choices: string[];
  description: string | null;
};

type AstSchema =
  | {
      kind: "object";
      description: string | null;
      optional: boolean;
      fields: Array<{ name: string; schema: AstSchema }>;
    }
  | {
      kind: FlagType;
      description: string | null;
      optional: boolean;
      choices: string[];
    }
  | {
      kind: "unknown" | "void" | "array" | "record";
      description: string | null;
      optional: boolean;
    };

type ProcedureMetadata = {
  path: string[];
  type: "query" | "mutation" | "subscription";
  input: AstSchema | null;
  output: string | null;
  description: string | null;
};

export type DomainMetadata = {
  name: string;
  procedures: ProcedureMetadata[];
};

export type GenerateCliFilesOptions = {
  routerPath: string;
  outDir: string;
  completionsDir?: string;
  useAst?: boolean;
};

const EMPTY_SCHEMA: AstSchema = {
  kind: "void",
  description: null,
  optional: true,
};

const ID_SCHEMA: AstSchema = {
  kind: "object",
  description: null,
  optional: false,
  fields: [
    {
      name: "id",
      schema: { kind: "string", description: null, optional: false, choices: [] },
    },
  ],
};

const RECORD_SCHEMA: AstSchema = {
  kind: "record",
  description: null,
  optional: true,
};

export function mapZodObjectToFlags(schema: z.ZodType): FlagDefinition[] {
  return schemaToFlags(zodToAstSchema(schema), []);
}

export async function generateCliFiles(options: GenerateCliFilesOptions): Promise<void> {
  const routerPath = resolve(options.routerPath);
  const outDir = resolve(options.outDir);
  const domains = await extractRouterMetadata(routerPath);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const domain of domains) {
    if (domain.procedures.length === 0) continue;
    await writeFile(join(outDir, `${domain.name}.ts`), emitDomain(domain));
  }

  if (options.completionsDir !== undefined) {
    const completionsDir = resolve(options.completionsDir);
    const { emitCompletionScripts } = await import("@fulcrum/cli/completion.ts");
    const scripts = emitCompletionScripts(domains);
    await mkdir(completionsDir, { recursive: true });
    await Promise.all([
      writeFile(join(completionsDir, "completions.sh"), scripts.bash),
      writeFile(join(completionsDir, "completions.zsh"), scripts.zsh),
      writeFile(join(completionsDir, "completions.fish"), scripts.fish),
    ]);
  }
}

function zodToAstSchema(schema: z.ZodType): AstSchema {
  const zodDef = getZodDef(schema);
  const kind = zodDef.type;
  if (kind === "optional") {
    const inner = zodToAstSchema(zodDef.innerType as z.ZodType);
    return { ...inner, optional: true };
  }
  if (kind === "default") {
    const inner = zodToAstSchema(zodDef.innerType as z.ZodType);
    return { ...inner, optional: true };
  }
  if (kind === "object") {
    const shape = getZodShape(zodDef.shape);
    return {
      kind: "object",
      description: schema.description ?? null,
      optional: false,
      fields: Object.entries(shape).map(([name, child]) => ({
        name,
        schema: zodToAstSchema(child),
      })),
    };
  }
  if (kind === "string" || kind === "number" || kind === "boolean") {
    return {
      kind,
      description: schema.description ?? null,
      optional: false,
      choices: [],
    };
  }
  if (kind === "enum") {
    return {
      kind: "enum",
      description: schema.description ?? null,
      optional: false,
      choices: Object.values(zodDef.entries ?? {}).map(String).sort(),
    };
  }
  return {
    kind: "unknown",
    description: schema.description ?? null,
    optional: false,
  };
}

function schemaToFlags(schema: AstSchema | null, path: string[]): FlagDefinition[] {
  if (schema === null) return [];
  if (schema.kind === "object") {
    return schema.fields
      .flatMap((field) => schemaToFlags(field.schema, [...path, field.name]))
      .sort(compareFlags);
  }
  if (schema.kind === "string" || schema.kind === "number" || schema.kind === "boolean" || schema.kind === "enum") {
    const name = path.map(kebab).join("-");
    const valueHint = schema.kind === "boolean" ? "" : ` <${schema.kind === "enum" ? "choice" : schema.kind}>`;
    return [
      {
        name,
        flag: `--${name}${valueHint}`,
        type: schema.kind,
        required: !schema.optional,
        choices: "choices" in schema ? schema.choices : [],
        description: schema.description,
      },
    ];
  }
  return [];
}

export async function extractRouterMetadata(routerPath: string): Promise<DomainMetadata[]> {
  const project = new Project({
    compilerOptions: {
      allowImportingTsExtensions: true,
      moduleResolution: 100,
      noEmit: true,
      strict: true,
    },
    skipAddingFilesFromTsConfig: true,
  });
  const entry = project.addSourceFileAtPath(routerPath);
  const source = await resolveAppRouterSource(entry, routerPath, project);
  const context = createExtractorContext(source, project);
  const appRouter = lookupVariable("appRouter", source, context);
  const initializer = appRouter?.getInitializer();
  const record = unwrapRouterObject(initializer);
  if (record === null) throw new Error(`appRouter t.router({...}) not found in ${routerPath}`);

  return objectProperties(record)
    .map(({ name, expression }) => ({
      name,
      procedures: extractRouterProcedures(expression, context, []),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveAppRouterSource(entry: SourceFile, routerPath: string, project: Project): Promise<SourceFile> {
  for (const declaration of entry.getExportDeclarations()) {
    const names = declaration.getNamedExports().map((item) => item.getName());
    if (!names.includes("appRouter") && !names.includes("AppRouter")) continue;
    const specifier = declaration.getModuleSpecifierValue();
    if (specifier === undefined) continue;
    const resolved = resolve(dirname(routerPath), specifier);
    return project.addSourceFileAtPath(resolved);
  }
  return entry;
}

type ExtractorContext = {
  source: SourceFile;
  project: Project;
  variables: Map<string, VariableDeclaration>;
  schemas: Map<string, AstSchema>;
  imports: Map<string, VariableDeclaration>;
};

const WORKSPACE_IMPORT_PREFIXES: Record<string, string> = {
  "@agent-client-protocol/": "services/agent-client-protocol/src/",
  "@execution-orchestration/": "services/execution-orchestration/src/",
  "@fulcrum/cli/": "apps/cli/src/",
  "@fulcrum/server/": "apps/server/src/",
  "@fulcrum/tui/": "apps/tui/src/",
  "@fulcrum/web/": "apps/web/src/",
  "@identity-access/": "services/identity-access/src/",
  "@integration-hub/": "services/integration-hub/src/",
  "@knowledge-workspace/": "services/knowledge-workspace/src/",
  "@notification-center/": "services/notification-center/src/",
  "@planning-review/": "services/planning-review/src/",
  "@platform-core/": "services/platform-core/src/",
  "@workflow-coordination/": "services/workflow-coordination/src/",
  "@work-management/": "services/work-management/src/",
};

function createExtractorContext(source: SourceFile, project: Project): ExtractorContext {
  const variables = new Map<string, VariableDeclaration>();
  const schemas = new Map<string, AstSchema>();
  const imports = new Map<string, VariableDeclaration>();
  const context: ExtractorContext = { source, project, variables, schemas, imports };
  const seen = new Set<string>();

  function collect(current: SourceFile): void {
    const path = current.getFilePath();
    if (seen.has(path)) return;
    seen.add(path);

    for (const declaration of current.getVariableDeclarations()) {
      variables.set(bindingKey(current, declaration.getName()), declaration);
    }

    for (const declaration of current.getImportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      const importedPath = resolveImportPath(path, specifier);
      if (importedPath === null) continue;
      let imported: SourceFile;
      try {
        imported = project.addSourceFileAtPath(importedPath);
      } catch {
        continue;
      }
      collect(imported);
      for (const item of declaration.getNamedImports()) {
        const importedName = item.getName();
        const localName = item.getAliasNode()?.getText() ?? importedName;
        const importedDeclaration = lookupVariable(importedName, imported, context);
        if (importedDeclaration) {
          imports.set(bindingKey(current, localName), importedDeclaration);
        }
      }
    }

    for (const declaration of current.getExportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      if (specifier === undefined) continue;
      const exportedPath = resolveImportPath(path, specifier);
      if (exportedPath === null) continue;
      let exported: SourceFile;
      try {
        exported = project.addSourceFileAtPath(exportedPath);
      } catch {
        continue;
      }
      collect(exported);
      const namedExports = declaration.getNamedExports();
      if (namedExports.length === 0) {
        for (const item of exported.getVariableDeclarations()) {
          const exportedDeclaration = lookupVariable(item.getName(), exported, context) ?? item;
          imports.set(bindingKey(current, item.getName()), exportedDeclaration);
        }
        continue;
      }
      for (const item of namedExports) {
        const exportedName = item.getName();
        const localName = item.getAliasNode()?.getText() ?? exportedName;
        const exportedDeclaration = lookupVariable(exportedName, exported, context);
        if (exportedDeclaration) {
          imports.set(bindingKey(current, localName), exportedDeclaration);
        }
      }
    }
  }

  collect(source);

  for (const [key, declaration] of variables.entries()) {
    const initializer = declaration.getInitializer();
    if (initializer !== undefined) {
      const schema = parseZodExpression(initializer, context);
      if (schema !== null) schemas.set(key, schema);
    }
  }
  return context;
}

function resolveImportPath(fromPath: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return resolve(dirname(fromPath), specifier);
  for (const [prefix, target] of Object.entries(WORKSPACE_IMPORT_PREFIXES)) {
    if (specifier.startsWith(prefix)) {
      return resolve(process.cwd(), target, specifier.slice(prefix.length));
    }
  }
  return null;
}

function bindingKey(source: SourceFile, name: string): string {
  return `${source.getFilePath()}:${name}`;
}

function lookupVariable(
  name: string,
  source: SourceFile,
  context: ExtractorContext,
): VariableDeclaration | undefined {
  return (
    context.variables.get(bindingKey(source, name)) ??
    context.imports.get(bindingKey(source, name))
  );
}

function lookupSchema(
  name: string,
  source: SourceFile,
  context: ExtractorContext,
): AstSchema | null {
  const local = context.schemas.get(bindingKey(source, name));
  if (local) return local;
  const imported = context.imports.get(bindingKey(source, name));
  if (!imported) return null;
  return context.schemas.get(bindingKey(imported.getSourceFile(), imported.getName())) ?? null;
}

function extractRouterProcedures(
  expression: Node,
  context: ExtractorContext,
  prefix: string[],
): ProcedureMetadata[] {
  const resolved = resolveExpression(expression, context);
  const routerObject = unwrapRouterObject(resolved);
  if (routerObject === null) return proceduresFromHelperCall(resolved, prefix);

  return objectProperties(routerObject)
    .flatMap(({ name, expression: propertyExpression }) => {
      if (Node.isSpreadAssignment(propertyExpression)) {
        return proceduresFromHelperCall(propertyExpression.getExpression(), prefix);
      }
      const nestedRouter = unwrapRouterObject(resolveExpression(propertyExpression, context));
      if (nestedRouter !== null) {
        return extractRouterProcedures(propertyExpression, context, [...prefix, name]);
      }
      const procedure = extractProcedure(propertyExpression, context, [...prefix, name]);
      return procedure === null ? [] : [procedure];
    })
    .sort((a, b) => a.path.join(".").localeCompare(b.path.join(".")));
}

function proceduresFromHelperCall(expression: Node, prefix: string[]): ProcedureMetadata[] {
  if (!Node.isCallExpression(expression)) return [];
  const helper = callName(expression);
  const domain = stringArg(expression, 0) ?? prefix.at(0) ?? "unknown";
  if (helper === "crudRouter" || helper === "crudProcedures") {
    return [
      helperProcedure(prefix, "list", "query", EMPTY_SCHEMA, null),
      helperProcedure(prefix, "get", "query", ID_SCHEMA, null),
      helperProcedure(prefix, "create", "mutation", RECORD_SCHEMA, `${domain} create`),
      helperProcedure(prefix, "update", "mutation", RECORD_SCHEMA, `${domain} update`),
      helperProcedure(prefix, "delete", "mutation", ID_SCHEMA, null),
    ];
  }
  if (helper === "listProcedure") return [helperProcedure(prefix, "list", "query", EMPTY_SCHEMA, null)];
  if (helper === "getProcedure") return [helperProcedure(prefix, "get", "query", ID_SCHEMA, null)];
  if (helper === "mutationProcedure") {
    return [helperProcedure(prefix, stringArg(expression, 1) ?? "run", "mutation", RECORD_SCHEMA, null)];
  }
  if (helper === "idMutationProcedure") {
    return [helperProcedure(prefix, stringArg(expression, 1) ?? "run", "mutation", ID_SCHEMA, null)];
  }
  return [];
}

function helperProcedure(
  prefix: string[],
  name: string,
  type: ProcedureMetadata["type"],
  input: AstSchema,
  description: string | null,
): ProcedureMetadata {
  return {
    path: [...prefix, name],
    type,
    input,
    output: null,
    description,
  };
}

function extractProcedure(
  expression: Node,
  context: ExtractorContext,
  path: string[],
): ProcedureMetadata | null {
  const resolved = resolveExpression(expression, context);
  if (!Node.isCallExpression(resolved)) return null;
  const type = procedureType(resolved);
  if (type === null) return procedureFromHelperCall(resolved, path);

  const inputExpression = chainedCallArgument(resolved, "input");
  const outputExpression = chainedCallArgument(resolved, "output");
  const input = inputExpression === null ? null : parseZodExpression(inputExpression, context);
  const output = outputExpression?.getText() ?? null;

  return {
    path,
    type,
    input,
    output,
    description: input?.description ?? null,
  };
}

function procedureFromHelperCall(expression: CallExpression, path: string[]): ProcedureMetadata | null {
  const helper = callName(expression);
  const name = path.at(-1) ?? stringArg(expression, 1) ?? "run";
  const prefix = path.slice(0, -1);
  if (helper === "listProcedure") return helperProcedure(prefix, name, "query", EMPTY_SCHEMA, null);
  if (helper === "getProcedure") return helperProcedure(prefix, name, "query", ID_SCHEMA, null);
  if (helper === "mutationProcedure") return helperProcedure(prefix, stringArg(expression, 1) ?? name, "mutation", RECORD_SCHEMA, null);
  if (helper === "idMutationProcedure") return helperProcedure(prefix, stringArg(expression, 1) ?? name, "mutation", ID_SCHEMA, null);
  return null;
}

function parseZodExpression(
  expression: Node,
  context: ExtractorContext,
): AstSchema | null {
  if (Node.isIdentifier(expression)) {
    return lookupSchema(expression.getText(), expression.getSourceFile(), context) ?? schemaFromKnownIdentifier(expression.getText());
  }
  if (!Node.isCallExpression(expression)) return null;

  const called = expression.getExpression();
  if (!Node.isPropertyAccessExpression(called)) return null;
  const method = called.getName();
  const target = called.getExpression();

  if (method === "describe") {
    const base = parseZodExpression(target, context);
    const description = stringArg(expression, 0);
    return base === null ? null : { ...base, description: description ?? base.description };
  }
  if (method === "optional" || method === "default" || method === "nullable") {
    const base = parseZodExpression(target, context);
    return base === null ? null : { ...base, optional: true };
  }
  if (
    method === "min" ||
    method === "max" ||
    method === "int" ||
    method === "nonnegative" ||
    method === "positive" ||
    method === "uuid" ||
    method === "email" ||
    method === "url"
  ) {
    return parseZodExpression(target, context);
  }
  if (method === "array") {
    return { kind: "array", description: null, optional: false };
  }
  if (target.getText() !== "z") return null;

  if (method === "object") {
    const shape = expression.getArguments()[0];
    if (!Node.isObjectLiteralExpression(shape)) {
      return { kind: "object", description: null, optional: false, fields: [] };
    }
    return {
      kind: "object",
      description: null,
      optional: false,
      fields: objectProperties(shape).map(({ name, expression: childExpression }) => ({
        name,
        schema: parseZodExpression(childExpression, context) ?? unknownSchema(),
      })),
    };
  }
  if (method === "string" || method === "number" || method === "boolean") {
    return { kind: method, description: null, optional: false, choices: [] };
  }
  if (method === "enum") {
    const arg = expression.getArguments()[0];
    const choices = Node.isArrayLiteralExpression(arg)
      ? arg.getElements().flatMap((item) => {
          if (Node.isStringLiteral(item)) return [item.getLiteralText()];
          return [];
        })
      : [];
    return { kind: "enum", description: null, optional: false, choices };
  }
  if (method === "record") return { kind: "record", description: null, optional: false };
  if (method === "void") return EMPTY_SCHEMA;
  return unknownSchema();
}

function schemaFromKnownIdentifier(name: string): AstSchema | null {
  if (name === "EmptyInputSchema") return EMPTY_SCHEMA;
  if (name === "IdInputSchema") return ID_SCHEMA;
  if (name === "OptionalRecordInputSchema") return RECORD_SCHEMA;
  return null;
}

function unwrapRouterObject(expression: Node | undefined): ObjectLiteralExpression | null {
  if (expression === undefined) return null;
  if (!Node.isCallExpression(expression)) return null;
  const called = expression.getExpression();
  if (!Node.isPropertyAccessExpression(called)) return null;
  if (called.getName() !== "router") return null;
  const args = expression.getArguments();
  const record = args[0];
  return Node.isObjectLiteralExpression(record) ? record : null;
}

function resolveExpression(expression: Node, context: ExtractorContext): Node {
  if (!Node.isIdentifier(expression)) return expression;
  const declaration = lookupVariable(expression.getText(), expression.getSourceFile(), context);
  if (declaration !== undefined && Node.isVariableDeclaration(declaration)) {
    return declaration.getInitializer() ?? expression;
  }
  return expression;
}

function objectProperties(object: ObjectLiteralExpression): Array<{ name: string; expression: Node }> {
  const properties: Array<{ name: string; expression: Node }> = [];
  for (const property of object.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      properties.push({ name: "...", expression: property });
      continue;
    }
    if (Node.isPropertyAssignment(property)) {
      const nameNode = property.getNameNode();
      const name = Node.isStringLiteral(nameNode) ? nameNode.getLiteralText() : property.getName();
      properties.push({ name, expression: property.getInitializerOrThrow() });
      continue;
    }
    if (Node.isShorthandPropertyAssignment(property)) {
      properties.push({ name: property.getName(), expression: property.getNameNode() });
    }
  }
  return properties;
}

function chainedCallArgument(expression: CallExpression, method: string): Node | null {
  let current: Node = expression;
  while (Node.isCallExpression(current)) {
    const called = current.getExpression();
    if (!Node.isPropertyAccessExpression(called)) return null;
    if (called.getName() === method) return current.getArguments()[0] ?? null;
    current = called.getExpression();
  }
  return null;
}

function procedureType(expression: CallExpression): ProcedureMetadata["type"] | null {
  const called = expression.getExpression();
  if (!Node.isPropertyAccessExpression(called)) return null;
  const name = called.getName();
  if (name === "query" || name === "mutation" || name === "subscription") return name;
  return null;
}

function callName(expression: CallExpression): string {
  const called = expression.getExpression();
  if (Node.isIdentifier(called)) return called.getText();
  if (Node.isPropertyAccessExpression(called)) return called.getName();
  return "";
}

function stringArg(expression: CallExpression, index: number): string | null {
  const arg = expression.getArguments()[index];
  if (Node.isStringLiteral(arg)) return arg.getLiteralText();
  if (Node.isNoSubstitutionTemplateLiteral(arg)) return arg.getLiteralText();
  return null;
}

function emitDomain(domain: DomainMetadata): string {
  const functionName = `create${pascal(domain.name)}Command`;
  const lines = [
    `import { Command, Option } from "commander";`,
    "",
    `export function ${functionName}(): Command {`,
    `  const command = new Command(${JSON.stringify(domain.name)});`,
    `  command.description(${JSON.stringify(`Generated ${domain.name} commands.`)});`,
    "",
  ];

  for (const procedure of domain.procedures) {
    const constName = `${camel(procedure.path.join("_"))}Command`;
    const commandPath = procedure.path.map(kebab).join(" ");
    const procedurePath = `${domain.name}.${procedure.path.join(".")}`;
    lines.push(`  const ${constName} = command.command(${JSON.stringify(commandPath)});`);
    lines.push(`  ${constName}.description(${JSON.stringify(procedure.description ?? `${domain.name} ${procedure.path.join(" ")}`)});`);
    lines.push(`  ${constName}.option("--json", "Emit JSON output");`);
    if (procedure.type === "subscription") {
      lines.push(`  ${constName}.option("--watch", "Stream subscription events as JSON lines");`);
    }
    for (const flag of schemaToFlags(procedure.input, [])) {
      const help = flag.description ?? flag.name;
      if (flag.type === "enum") {
        lines.push(`  ${constName}.addOption(new Option(${JSON.stringify(flag.flag)}, ${JSON.stringify(help)}).choices(${JSON.stringify(flag.choices)}));`);
      } else if (flag.type === "number") {
        lines.push(`  ${constName}.option(${JSON.stringify(flag.flag)}, ${JSON.stringify(help)}, Number.parseFloat);`);
      } else {
        lines.push(`  ${constName}.option(${JSON.stringify(flag.flag)}, ${JSON.stringify(help)});`);
      }
    }
    lines.push(`  ${constName}.action(async (options) => {`);
    lines.push(`    try {`);
    if (procedure.type === "subscription") {
      lines.push(`      if (options.watch === true) {`);
      lines.push(`        await runGeneratedSubscriptionWatch({ procedurePath: ${JSON.stringify(procedurePath)} });`);
      lines.push(`        return;`);
      lines.push(`      }`);
    }
    lines.push(`      throw new Error(${JSON.stringify(`Generated tRPC invocation for ${procedurePath} requires an explicit surface adapter.`)});`);
    lines.push(`    } catch (error) {`);
    lines.push(`      if (options.json === true) {`);
    lines.push(`        const message = error instanceof Error ? error.message : String(error);`);
    lines.push(`        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));`);
    lines.push(`        process.exitCode = 1;`);
    lines.push(`        return;`);
    lines.push(`      }`);
    lines.push(`      throw error;`);
    lines.push(`    }`);
    lines.push(`  });`);
    lines.push("");
  }

  lines.push("  return command;");
  lines.push("}");
  lines.push("");
  if (domain.procedures.some((procedure) => procedure.type === "subscription")) {
    lines.push("async function runGeneratedSubscriptionWatch(options: { procedurePath: string }): Promise<void> {");
    lines.push("  const shutdown = new Promise<void>((resolve) => {");
    lines.push("    process.once(\"SIGINT\", () => resolve());");
    lines.push("  });");
    lines.push("  await Promise.race([");
    lines.push("    shutdown,");
    lines.push("    Promise.reject(new Error(`Generated tRPC subscription for ${options.procedurePath} requires an explicit surface adapter.`)),");
    lines.push("  ]);");
    lines.push("}");
    lines.push("");
  }
  return lines.join("\n");
}

function getZodDef(schema: z.ZodType): {
  type: string;
  innerType?: unknown;
  shape?: unknown;
  entries?: Record<string, unknown>;
} {
  return (schema as unknown as { def: { type: string } }).def;
}

function getZodShape(shape: unknown): Record<string, z.ZodType> {
  if (typeof shape === "function") return shape() as Record<string, z.ZodType>;
  return shape as Record<string, z.ZodType>;
}

function compareFlags(a: FlagDefinition, b: FlagDefinition): number {
  return a.name.localeCompare(b.name);
}

function unknownSchema(): AstSchema {
  return { kind: "unknown", description: null, optional: false };
}

function kebab(value: string): string {
  return value.replaceAll("_", "-").replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`).replace(/^-/, "");
}

function pascal(value: string): string {
  return value
    .split(/[_\-.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function camel(value: string): string {
  const name = pascal(value);
  return name.charAt(0).toLowerCase() + name.slice(1);
}

if (import.meta.main) {
  const args = new Set(Bun.argv.slice(2));
  const root = resolve(import.meta.dir, "../..");
  const routerPath = join(root, "apps/server/src/trpc/router.ts");
  const outDir = join(root, "apps/cli/src/generated");
  const completionsDir = join(root, "scripts/cli");
  const start = performance.now();
  await generateCliFiles({ routerPath, outDir, completionsDir, useAst: !args.has("--no-ast") });
  const elapsed = performance.now() - start;
  if (elapsed > 30_000) {
    console.error("codegen exceeded 30s; rerun with --no-ast to force template emit fallback");
    process.exitCode = 1;
  }
}
