export const CODE_FILE_REGEX =
  /(?:\.(tsx?|jsx?|py|rb|go|rs|java|c|cpp|h|hpp|cs|swift|kt|scala|sh|bash|zsh|sql|graphql|json|ya?ml|toml|ini|css|scss|less|xml|tf|lua|r|dart|ex|exs|vue|svelte|astro|zig|proto)|(?:^|\/)(Dockerfile|Makefile|Rakefile|Gemfile|Procfile|Vagrantfile|Brewfile|Justfile))$/i;

export const CODE_PATH_BARE_REGEX =
  /(?:\.{0,2}\/)?(?:[a-zA-Z0-9_@.\-[\]]+\/)+[a-zA-Z0-9_.\-[\]]+\.[a-zA-Z0-9]+(?::\d+(?:-\d+)?)?/g;

const IMPLAUSIBLE_CHARS = /[{},*?\s]/;

export function isPlausibleCodeFilePath(input: string): boolean {
  return !IMPLAUSIBLE_CHARS.test(input);
}

export interface ParsedCodePath {
  filePath: string;
  line?: number;
  lineEnd?: number;
}

const LINE_SUFFIX_RE = /:(\d+)(?:-(\d+))?$/;

export function parseCodePath(input: string): ParsedCodePath {
  const clean = input.replace(/#.*$/, "");
  const match = clean.match(LINE_SUFFIX_RE);
  if (!match) return { filePath: clean };

  let line = Number.parseInt(match[1] ?? "", 10);
  let lineEnd = match[2] ? Number.parseInt(match[2], 10) : undefined;

  if (lineEnd != null && lineEnd < line) {
    const tmp = line;
    line = lineEnd;
    lineEnd = tmp;
  }

  return { filePath: clean.replace(LINE_SUFFIX_RE, ""), line, lineEnd };
}

export function stripLineRef(input: string): string {
  return input.replace(/#.*$/, "").replace(LINE_SUFFIX_RE, "");
}

export function isCodeFilePath(input: string): boolean {
  if (!isPlausibleCodeFilePath(input)) return false;
  return CODE_FILE_REGEX.test(stripLineRef(input)) &&
    !input.startsWith("http://") &&
    !input.startsWith("https://");
}

export function isCodeFilePathStrict(input: string): boolean {
  return input.includes("/") && isCodeFilePath(input);
}
