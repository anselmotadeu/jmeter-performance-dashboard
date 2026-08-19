const SECRET_PATTERN =
  /\b(authorization|token|api[_-]?key|password|secret)=([^\s&]+)/gi;
export function sanitizeLabel(value: string) {
  const trimmed = value.trim() || "Sem nome";
  try {
    const url = new URL(trimmed);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, 300);
  } catch {
    return trimmed.replace(SECRET_PATTERN, "$1=[REDACTED]").slice(0, 300);
  }
}
export function sanitizeMessage(value: string) {
  return value
    .replace(/https?:\/\/[^\s]+/gi, (raw) => {
      try {
        const url = new URL(raw);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return "[URL]";
      }
    })
    .replace(SECRET_PATTERN, "$1=[REDACTED]")
    .slice(0, 500);
}
