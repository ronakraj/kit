/**
 * Extracts a source URL from pasted HTML clipboard data, if present.
 *
 * Some browsers (notably on Windows) attach a "CF_HTML" header to the
 * `text/html` clipboard payload when you copy from a web page, which
 * includes a `SourceURL:` line pointing back to the original page. This is
 * inherently best-effort: it's a Windows-clipboard convention, not a web
 * standard, so most OS/browser/source combinations won't populate it and
 * this will simply return null.
 */
export function extractPasteSourceUrl(html: string): string | null {
  const match = html.match(/^SourceURL:(\S+)/m);
  return match ? match[1] : null;
}
