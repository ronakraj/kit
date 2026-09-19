import { describe, it, expect } from "vitest";
import { cleanPreviewText } from "./wikiPreview";

describe("cleanPreviewText", () => {
  it("strips headings, emphasis marks, and code fences", () => {
    const raw = "# Sigmoid\n\nA **squashing** function used in ```math\nx\n``` neural nets.";
    expect(cleanPreviewText(raw)).toBe("Sigmoid A squashing function used in neural nets.");
  });

  it("strips block-history markers", () => {
    const raw = "<!--kb:abc123-->\nSome text here.";
    expect(cleanPreviewText(raw)).toBe("Some text here.");
  });

  it("truncates long bodies with an ellipsis", () => {
    const raw = "word ".repeat(100);
    const result = cleanPreviewText(raw);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThan(raw.length);
  });

  it("returns a placeholder for an empty note", () => {
    expect(cleanPreviewText("   \n\n  ")).toBe("(empty note)");
  });
});
