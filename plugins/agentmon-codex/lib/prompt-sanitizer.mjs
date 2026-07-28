export function sanitizePrompt(input) {
  let text = String(input ?? "")
    .replace(/<(environment_context|recommended_plugins)>[\s\S]*?<\/\1>/gi, "")
    .replace(/<permissions instructions>[\s\S]*?<\/permissions instructions>/gi, "")
    .trim();
  let redactions = 0;
  const replacements = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]"],
    [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED API KEY]"],
    [/\b(?:ghp|github_pat|xox[baprs])-[A-Za-z0-9_-]{12,}\b/gi, "[REDACTED TOKEN]"],
    [/(authorization\s*:\s*bearer\s+)[^\s"']+/gi, "$1[REDACTED]"],
    [/((?:api[_-]?key|access[_-]?token|auth[_-]?token|password)\s*[:=]\s*)["']?[^\s,"']{8,}["']?/gi, "$1[REDACTED]"],
    [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/gi, (match) => `${match.slice(0, match.indexOf("://") + 3)}[REDACTED]@`],
  ];
  for (const [pattern, replacement] of replacements) {
    redactions += text.match(pattern)?.length ?? 0;
    text = text.replace(pattern, replacement);
  }
  return { text: text.trim(), redactions };
}
