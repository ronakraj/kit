const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

export function extractWikiLinks(body: string): string[] {
  const titles: string[] = [];
  for (const match of body.matchAll(WIKI_LINK_RE)) {
    titles.push(match[1].trim());
  }
  return titles;
}

/** Maps a target note title (lowercased) to the list of note {name, path} that link to it. */
export type BacklinksIndex = Map<string, { name: string; path: string }[]>;

const EMPTY_BACKLINKS: { name: string; path: string }[] = [];

export function getBacklinksFor(index: BacklinksIndex, title: string): { name: string; path: string }[] {
  return index.get(title.trim().toLowerCase()) ?? EMPTY_BACKLINKS;
}
