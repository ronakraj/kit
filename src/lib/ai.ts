/**
 * AI backend for terminology research. The real backend (Claude API, or
 * something else) hasn't been decided yet, so this is a self-contained stub
 * that simulates network latency and returns realistic placeholder markdown.
 * Swapping in a real implementation later only requires changing the body of
 * `researchTerm` below — callers only depend on this function's signature.
 */

export type ResearchDepth = "concise" | "deep";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stubConcise(term: string): string {
  return `**${term}** is a term that showed up in what you were reading. This is a placeholder explanation — once a real AI backend is wired up, this will be a concise, accurate definition of "${term}" grounded in the surrounding context you were writing about.`;
}

function stubDeep(term: string): string {
  return [
    `## Definition`,
    `A placeholder deep-dive on **${term}**. Once a real AI backend is connected, this section will contain an accurate, concise definition.`,
    ``,
    `## Why it matters`,
    `This section will explain why ${term} is relevant to the material you're reading, based on the context captured when you triggered the research.`,
    ``,
    `## Related concepts`,
    `This section will list nearby terms and how ${term} relates to them.`,
    ``,
    `## Example`,
    `This section will include a concrete example or use case involving ${term}.`,
  ].join("\n");
}

/**
 * Researches a term and returns markdown explaining it.
 *
 * @param term The selected term/phrase to research.
 * @param context Surrounding text (e.g. the paragraph the term was selected
 *   from) a real implementation would use to disambiguate the term.
 * @param depth "concise" for a short explanation, "deep" for a fuller
 *   structured draft the user can edit into their own notes.
 */
export async function researchTerm(term: string, context: string, depth: ResearchDepth): Promise<string> {
  void context; // unused by the stub; a real backend would send this along for disambiguation
  await delay(600 + Math.random() * 300);
  return depth === "concise" ? stubConcise(term) : stubDeep(term);
}
