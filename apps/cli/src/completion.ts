import { extractRouterMetadata, type DomainMetadata } from "../../../scripts/cli/codegen.ts";

import { emitErrorResult, emitResult, type OutputIo } from "./lib/cli-output.ts";
import { wantsHelp } from "./lib/flag-conventions.ts";

export type CompletionShell = "bash" | "zsh" | "fish" | "powershell";

export type CompletionScripts = Record<CompletionShell, string>;

/** The four shells `fulcrum completion` supports — `CLI-TUI-UX.md` §4. */
export const COMPLETION_SHELLS: readonly CompletionShell[] = ["bash", "zsh", "fish", "powershell"];

export type GenerateCompletionScriptsOptions = {
  routerPath: string;
};

type CompletionCommand = {
  name: string;
  verbs: string[];
  flags: string[];
  dynamicIdSource: string | null;
};

export async function generateCompletionScripts(
  options: GenerateCompletionScriptsOptions,
): Promise<CompletionScripts> {
  return emitCompletionScripts(await extractRouterMetadata(options.routerPath));
}

export function emitCompletionScripts(domains: DomainMetadata[]): CompletionScripts {
  const commands = domains
    .filter((domain) => domain.procedures.length > 0)
    .map(domainCompletion)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    bash: emitBash(commands),
    zsh: emitZsh(commands),
    fish: emitFish(commands),
    powershell: emitPowerShell(commands),
  };
}

/**
 * The `CLI-TUI-UX.md` §4 install-guidance lines for one shell.
 *
 * Per §4 the completion command must *tell the user exactly* how to install the
 * script it just printed. These lines are rendered as comments at the head of
 * the printed script (so `> _fulcrum` keeps a valid file) and are also surfaced
 * structured in the `--json` envelope `result.install`.
 */
export function completionInstallGuidance(shell: CompletionShell): readonly string[] {
  switch (shell) {
    case "bash":
      return [
        "Add to ~/.bashrc:",
        "  source <(fulcrum completion bash)",
        "Or install to bash-completion.d:",
        "  fulcrum completion bash > /usr/local/etc/bash_completion.d/fulcrum",
      ];
    case "zsh":
      return [
        "Add to ~/.zshrc:",
        "  source <(fulcrum completion zsh)",
        "Or install to fpath:",
        "  fulcrum completion zsh > /usr/local/share/zsh/site-functions/_fulcrum",
      ];
    case "fish":
      return [
        "Install to fish completions:",
        "  fulcrum completion fish > ~/.config/fish/completions/fulcrum.fish",
      ];
    case "powershell":
      return [
        "Add to your PowerShell profile:",
        "  fulcrum completion powershell | Out-String | Invoke-Expression",
        "Or persist it:",
        "  fulcrum completion powershell >> $PROFILE",
      ];
  }
}

/**
 * Render the `CLI-TUI-UX.md` §4 completion script for one shell, prefixed with
 * the install-guidance comment header.
 *
 * The bare script bodies emitted by {@link emitCompletionScripts} stay byte-for
 * byte identical to the committed `scripts/cli/completions.*` codegen output —
 * the header is added only here, on the command path, so a user who runs
 * `fulcrum completion zsh` sees how to install it.
 */
export function renderCompletionScript(shell: CompletionShell, bareScript: string): string {
  const guidance = completionInstallGuidance(shell);
  const header = [`# Fulcrum ${shell} completion`, ...guidance.map((line) => `# ${line}`), ""];
  return `${header.join("\n")}\n${bareScript}`;
}

export async function printCompletionScript(
  shell: CompletionShell,
  options: GenerateCompletionScriptsOptions,
): Promise<void> {
  const scripts = await generateCompletionScripts(options);
  process.stdout.write(renderCompletionScript(shell, scripts[shell]));
}

const HELP = [
  "fulcrum completion <bash|zsh|fish|powershell>",
  "",
  "Print a shell completion script for the fulcrum CLI.",
  "",
  "Usage:",
  "  fulcrum completion <shell> [--json]",
  "  fulcrum completion --shell <shell>      (compatibility alias)",
  "",
  "Shells: bash, zsh, fish, powershell",
  "",
  "Install examples (CLI-TUI-UX.md §4):",
  "  # zsh — add to ~/.zshrc:",
  "  source <(fulcrum completion zsh)",
  "  # zsh — or install to fpath:",
  "  fulcrum completion zsh > /usr/local/share/zsh/site-functions/_fulcrum",
  "  # bash — add to ~/.bashrc:",
  "  source <(fulcrum completion bash)",
  "  # fish — install to fish completions:",
  "  fulcrum completion fish > ~/.config/fish/completions/fulcrum.fish",
  "  # powershell — add to your profile:",
  "  fulcrum completion powershell | Out-String | Invoke-Expression",
  "",
  "Options:",
  "  --json        Output the fulcrum.cli.v1 envelope (script + install guidance).",
  "  -h, --help    Show this help.",
].join("\n");

/** Resolve a completion shell from a positional arg or the `--shell` alias. */
export function resolveCompletionShell(argv: readonly string[]): {
  shell: CompletionShell | null;
  raw: string | undefined;
} {
  // Compatibility alias: `--shell <shell>` / `-s <shell>` is still accepted.
  const flagValue = valueAfter(argv, "--shell") ?? valueAfter(argv, "-s");
  // Spec form (`CLI-TUI-UX.md` §4): `fulcrum completion zsh` — first positional.
  const positional = argv.find((token) => !token.startsWith("-"));
  const raw = positional ?? flagValue;
  if (isCompletionShell(raw)) return { shell: raw, raw };
  return { shell: null, raw };
}

function isCompletionShell(value: unknown): value is CompletionShell {
  return COMPLETION_SHELLS.includes(value as CompletionShell);
}

/**
 * `fulcrum completion <shell>` — print a shell completion script.
 *
 * Output paths (`CLI-TUI-UX.md` §3 / §4):
 *  - plain: the install-guidance comment header followed by the completion script.
 *  - `--json`: the canonical `fulcrum.cli.v1` envelope, `result` carrying the
 *    shell, script, and structured install guidance.
 *  - unsupported / missing shell: the canonical envelope error
 *    (`FUL_CLI_UNSUPPORTED_SHELL`) under `--json`, and the `COPY.md` §3 plain
 *    recovery block (`message` + `Fix:` + `trace=<id>`) on stderr otherwise.
 */
export async function run(argv: readonly string[]): Promise<void> {
  const io: OutputIo = {
    print: (line) => process.stdout.write(`${line}\n`),
    printErr: (line) => process.stderr.write(`${line}\n`),
  };

  // `CLI-TUI-UX.md` §2 — `--help` always works, even after other flags.
  if (wantsHelp(argv)) {
    io.print(HELP);
    return;
  }

  const { shell, raw } = resolveCompletionShell(argv);
  if (!shell) {
    const supported = COMPLETION_SHELLS.join(", ");
    emitErrorResult(
      {
        argv,
        command: "fulcrum completion",
        args: { shell: raw ?? null },
        error: {
          code: "FUL_CLI_UNSUPPORTED_SHELL",
          message: raw
            ? `Unsupported shell "${raw}". fulcrum completion supports: ${supported}.`
            : `No shell given. fulcrum completion supports: ${supported}.`,
          fix: "fulcrum completion zsh",
          doc: "https://fulcrum.dev/docs/cli/completion",
        },
        renderHuman: () => {},
      },
      io,
    );
    process.exitCode = 2;
    return;
  }

  const scripts = await generateCompletionScripts({ routerPath: "apps/server/src/trpc/router.ts" });
  const script = renderCompletionScript(shell, scripts[shell]);
  emitResult(
    {
      argv,
      command: "fulcrum completion",
      args: { shell },
      result: {
        shell,
        script,
        install: completionInstallGuidance(shell),
      },
      renderHuman: () => process.stdout.write(script),
    },
    io,
  );
}

function domainCompletion(domain: DomainMetadata): CompletionCommand {
  return {
    name: domain.name,
    verbs: uniqueSorted(domain.procedures.map((procedure) => procedure.path.map(kebab).join(" "))),
    flags: uniqueSorted(domain.procedures.flatMap((procedure) => procedureFlags(procedure))),
    dynamicIdSource: domain.procedures.some((procedure) => procedure.path.join(".") === "list") ? domain.name : null,
  };
}

function procedureFlags(procedure: DomainMetadata["procedures"][number]): string[] {
  const flags = ["--json"];
  if (procedure.type === "subscription") flags.push("--watch");
  return flags;
}

function emitBash(commands: CompletionCommand[]): string {
  const domains = commands.map((command) => command.name);
  const lines = [
    "# bash completion for fulcrum",
    "# Generated by scripts/cli/codegen.ts.",
    "_fulcrum_dynamic_ids() {",
    "  local domain=\"$1\"",
    "  command fulcrum \"$domain\" list --json 2>/dev/null | jq -r '.[]?.id // empty' 2>/dev/null || true",
    "}",
    "",
    "_fulcrum() {",
    "  local cur prev domain",
    "  COMPREPLY=()",
    "  cur=\"${COMP_WORDS[COMP_CWORD]}\"",
    "  prev=\"${COMP_WORDS[COMP_CWORD-1]}\"",
    "  domain=\"${COMP_WORDS[1]}\"",
    "  if [[ ${COMP_CWORD} -eq 1 ]]; then",
    `    COMPREPLY=( $(compgen -W ${shellWords(domains)} -- "$cur") )`,
    "    return 0",
    "  fi",
    "  case \"$domain\" in",
  ];

  for (const command of commands) {
    lines.push(`    ${bashCase(command.name)})`);
    lines.push(`      local verbs=${shellWords(command.verbs)}`);
    lines.push(`      local flags=${shellWords(command.flags)}`);
    lines.push("      if [[ \"$cur\" == --* ]]; then");
    lines.push("        COMPREPLY=( $(compgen -W \"$flags\" -- \"$cur\") )");
    lines.push("        return 0");
    lines.push("      fi");
    if (command.dynamicIdSource !== null) {
      lines.push("      if [[ \"$prev\" == \"get\" || \"$prev\" == \"delete\" || \"$prev\" == \"update\" ]]; then");
      lines.push(`        COMPREPLY=( $(compgen -W "$(_fulcrum_dynamic_ids ${bashQuote(command.dynamicIdSource)})" -- "$cur") )`);
      lines.push("        return 0");
      lines.push("      fi");
    }
    lines.push("      COMPREPLY=( $(compgen -W \"$verbs $flags\" -- \"$cur\") )");
    lines.push("      ;;");
  }

  lines.push("  esac");
  lines.push("}");
  lines.push("complete -F _fulcrum fulcrum");
  lines.push("");
  return lines.join("\n");
}

function emitZsh(commands: CompletionCommand[]): string {
  const domainSpecs = commands.map((command) => `${command.name}:fulcrum ${command.name}`);
  const lines = [
    "#compdef fulcrum",
    "# zsh completion for fulcrum",
    "# Generated by scripts/cli/codegen.ts.",
    "_fulcrum_dynamic_ids() {",
    "  command fulcrum \"$1\" list --json 2>/dev/null | jq -r '.[]?.id // empty' 2>/dev/null || true",
    "}",
    "",
    "_fulcrum() {",
    "  local -a domains",
    `  domains=(${zshSpecs(domainSpecs)})`,
    "  if (( CURRENT == 2 )); then",
    "    _describe 'fulcrum command' domains",
    "    return",
    "  fi",
    "  case $words[2] in",
  ];

  for (const command of commands) {
    const specs = [
      ...command.verbs.map((verb) => `${verb}:fulcrum ${command.name} ${verb}`),
      ...command.flags.map((flag) => `${flag}:option`),
    ];
    lines.push(`    ${zshCase(command.name)})`);
    lines.push(`      local -a values=(${zshSpecs(specs)})`);
    if (command.dynamicIdSource !== null) {
      lines.push("      if [[ $words[CURRENT-1] == (get|delete|update) ]]; then");
      lines.push(`        _values 'ids' $(_fulcrum_dynamic_ids ${zshQuote(command.dynamicIdSource)})`);
      lines.push("        return");
      lines.push("      fi");
    }
    lines.push("      _describe 'command or option' values");
    lines.push("      ;;");
  }

  lines.push("  esac");
  lines.push("}");
  lines.push("_fulcrum \"$@\"");
  lines.push("");
  return lines.join("\n");
}

function emitFish(commands: CompletionCommand[]): string {
  const lines = [
    "# fish completion for fulcrum",
    "# Generated by scripts/cli/codegen.ts.",
    "function __fulcrum_dynamic_ids",
    "    command fulcrum $argv[1] list --json 2>/dev/null | jq -r '.[]?.id // empty' 2>/dev/null",
    "end",
    "",
  ];

  for (const command of commands) {
    lines.push(`complete -c fulcrum -n "__fish_use_subcommand" -a ${fishQuote(command.name)} -d ${fishQuote(`fulcrum ${command.name}`)}`);
    for (const verb of command.verbs) {
      lines.push(`complete -c fulcrum -n "__fish_seen_subcommand_from ${fishQuote(command.name)}" -a ${fishQuote(verb)} -d ${fishQuote(`${command.name} ${verb}`)}`);
    }
    for (const flag of command.flags) {
      lines.push(`complete -c fulcrum -n "__fish_seen_subcommand_from ${fishQuote(command.name)}" -l ${fishFlag(flag)} -d option`);
    }
    if (command.dynamicIdSource !== null) {
      lines.push(`complete -c fulcrum -n "__fish_seen_subcommand_from ${fishQuote(command.name)}; and __fish_prev_arg_in get delete update" -a "(__fulcrum_dynamic_ids ${fishQuote(command.name)})"`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function emitPowerShell(commands: CompletionCommand[]): string {
  const domains = commands.map((command) => command.name);
  const verbMap = Object.fromEntries(commands.map((command) => [command.name, command.verbs]));
  const flagMap = Object.fromEntries(commands.map((command) => [command.name, command.flags]));
  return [
    "# powershell completion for fulcrum",
    "# Generated by scripts/cli/codegen.ts.",
    `$FulcrumDomains = @(${domains.map(pwshQuote).join(", ")})`,
    `$FulcrumVerbs = ${JSON.stringify(verbMap)}`,
    `$FulcrumFlags = ${JSON.stringify(flagMap)}`,
    "Register-ArgumentCompleter -Native -CommandName fulcrum -ScriptBlock {",
    "  param($wordToComplete, $commandAst, $cursorPosition)",
    "  $words = $commandAst.CommandElements | ForEach-Object { $_.ToString() }",
    "  if ($words.Count -le 2) {",
    "    $FulcrumDomains | Where-Object { $_ -like \"$wordToComplete*\" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }",
    "    return",
    "  }",
    "  $domain = $words[1]",
    "  $values = @()",
    "  if ($FulcrumVerbs.$domain) { $values += $FulcrumVerbs.$domain }",
    "  if ($FulcrumFlags.$domain) { $values += $FulcrumFlags.$domain }",
    "  $values | Where-Object { $_ -like \"$wordToComplete*\" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }",
    "}",
    "",
  ].join("\n");
}

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function kebab(value: string): string {
  return value.replaceAll("_", "-").replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`).replace(/^-/, "");
}

function shellWords(values: string[]): string {
  return bashQuote(values.join(" "));
}

function bashCase(value: string): string {
  return value.replace(/([\\()*?[\]{}|;&<>`$! ])/g, "\\$1");
}

function bashQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function zshCase(value: string): string {
  return value.replace(/([\\()*?[\]{}|;&<>`$! ])/g, "\\$1");
}

function zshSpecs(values: string[]): string {
  return values.map(zshQuote).join(" ");
}

function zshQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''").replaceAll("[", "\\[").replaceAll("]", "\\]")}'`;
}

function fishQuote(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function fishFlag(flag: string): string {
  return flag.replace(/^--/, "");
}

function pwshQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
