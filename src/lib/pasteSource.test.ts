import { describe, it, expect } from "vitest";
import { extractPasteSourceUrl } from "./pasteSource";

describe("extractPasteSourceUrl", () => {
  it("extracts the URL from a CF_HTML header", () => {
    const html = [
      "Version:0.9",
      "StartHTML:0000000105",
      "EndHTML:0000000199",
      "StartFragment:0000000141",
      "EndFragment:0000000163",
      "SourceURL:https://example.com/article",
      "<html><body><!--StartFragment-->hello<!--EndFragment--></body></html>",
    ].join("\r\n");
    expect(extractPasteSourceUrl(html)).toBe("https://example.com/article");
  });

  it("returns null for plain HTML with no CF_HTML header", () => {
    expect(extractPasteSourceUrl("<p>just some pasted html</p>")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractPasteSourceUrl("")).toBeNull();
  });

  it("only matches a line that starts with SourceURL: (not incidental text elsewhere)", () => {
    const html = "<p>Check out SourceURL:not-a-real-header inside a paragraph</p>";
    expect(extractPasteSourceUrl(html)).toBeNull();
  });
});
