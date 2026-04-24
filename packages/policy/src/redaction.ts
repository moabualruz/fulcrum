export interface RedactionPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export const defaultSecretPatterns: RedactionPattern[] = [
  {
    name: "openai-api-key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    replacement: "[REDACTED_OPENAI_KEY]"
  },
  {
    name: "github-token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]"
  },
  {
    name: "generic-secret-assignment",
    pattern: /\b(secret|token|password)=\S+/gi,
    replacement: "$1=[REDACTED]"
  },
  {
    name: "bearer-token",
    pattern: /\bBearer\s+[A-Za-z0-9._-]{16,}\b/g,
    replacement: "Bearer [REDACTED]"
  },
  {
    name: "release-evidence-env-secret",
    pattern: /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY))=("[^"]+"|'[^']+'|\S+)/g,
    replacement: "$1=[REDACTED]"
  },
  {
    name: "compliance-export-credential-path",
    pattern:
      /\b(?:credential(?:Path|File|Ref)?|(?:secret|token|password)(?:Path|File|Ref))\s*[:=]\s*\S+/gi,
    replacement: "[REDACTED_CREDENTIAL_REF]"
  }
];

export function redactText(
  input: string,
  patterns: readonly RedactionPattern[] = defaultSecretPatterns
): {
  text: string;
  redacted: boolean;
  matches: string[];
} {
  let text = input;
  const matches: string[] = [];
  for (const entry of patterns) {
    const before = text;
    text = text.replace(entry.pattern, entry.replacement);
    if (before !== text) {
      matches.push(entry.name);
    }
  }
  return { text, redacted: matches.length > 0, matches };
}
