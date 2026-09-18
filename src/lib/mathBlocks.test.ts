import { describe, it, expect } from "vitest";
import katex from "katex";
import { safeEvaluateAt, samplePlot, toPersistableBlocks, fromPersistedBlocks, type AnyBlock, DEFAULT_PLOT_X_MIN, DEFAULT_PLOT_X_MAX } from "./mathBlocks";

describe("safeEvaluateAt", () => {
  it("evaluates a valid expression at a point", () => {
    expect(safeEvaluateAt("x^2", 3)).toBe(9);
    expect(safeEvaluateAt("sin(x)", 0)).toBe(0);
  });

  it("returns null for a malformed expression instead of throwing", () => {
    expect(safeEvaluateAt("not a valid expr", 1)).toBeNull();
  });

  it("returns null for a non-real (complex) result instead of throwing", () => {
    expect(safeEvaluateAt("sqrt(x)", -1)).toBeNull();
  });

  it("returns null for a non-finite result", () => {
    expect(safeEvaluateAt("1/x", 0)).toBeNull();
  });
});

describe("samplePlot", () => {
  it("samples the requested number of points across the range", () => {
    const points = samplePlot("x", 0, 10, 11);
    expect(points).toHaveLength(11);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[10]).toEqual({ x: 10, y: 10 });
  });

  it("marks unevaluable points with y: null rather than dropping them", () => {
    const points = samplePlot("sqrt(x)", -1, 1, 3);
    expect(points[0]).toEqual({ x: -1, y: null });
    expect(points[2].y).toBeCloseTo(1);
  });

  it("returns an empty array for a degenerate or invalid range", () => {
    expect(samplePlot("x", 5, 5)).toEqual([]);
    expect(samplePlot("x", 5, -5)).toEqual([]);
    expect(samplePlot("x", NaN, 5)).toEqual([]);
  });
});

describe("katex rendering", () => {
  it("renders valid LaTeX to non-empty HTML without throwing", () => {
    const html = katex.renderToString("\\frac{1}{2}", { throwOnError: false, displayMode: true });
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("katex");

    const html2 = katex.renderToString("x^2 + y^2 = r^2", { throwOnError: false, displayMode: true });
    expect(html2.length).toBeGreaterThan(0);
  });

  it("renders invalid LaTeX as an inline error rather than throwing", () => {
    expect(() => katex.renderToString("\\frac{1", { throwOnError: false, displayMode: true })).not.toThrow();
    const html = katex.renderToString("\\frac{1", { throwOnError: false, displayMode: true });
    expect(html).toContain("katex-error");
  });
});

function paragraph(text: string): AnyBlock {
  return { id: "p1", type: "paragraph", content: [{ type: "text", text, styles: {} }] };
}

function codeBlock(language: string, text: string): AnyBlock {
  return { id: "c1", type: "codeBlock", props: { language }, content: [{ type: "text", text, styles: {} }] };
}

describe("toPersistableBlocks / fromPersistedBlocks round trip", () => {
  it("converts an equation block to a math code block and back", () => {
    const blocks: AnyBlock[] = [{ id: "e1", type: "equation", props: { latex: "x^2 + 1" } }];
    const persisted = toPersistableBlocks(blocks);
    expect(persisted).toEqual([{ id: "e1", type: "codeBlock", props: { language: "math" }, content: [{ type: "text", text: "x^2 + 1", styles: {} }] }]);

    const restored = fromPersistedBlocks(persisted);
    expect(restored).toEqual([{ id: "e1", type: "equation", props: { latex: "x^2 + 1" } }]);
  });

  it("converts a plot block with default range to a plain expression code block and back", () => {
    const blocks: AnyBlock[] = [{ id: "pl1", type: "plot", props: { expression: "sin(x)", xMin: DEFAULT_PLOT_X_MIN, xMax: DEFAULT_PLOT_X_MAX } }];
    const persisted = toPersistableBlocks(blocks);
    expect(persisted[0]).toMatchObject({ type: "codeBlock", props: { language: "plot" } });
    expect((persisted[0].content as { text: string }[])[0].text).toBe("sin(x)");

    const restored = fromPersistedBlocks(persisted);
    expect(restored).toEqual([{ id: "pl1", type: "plot", props: { expression: "sin(x)", xMin: DEFAULT_PLOT_X_MIN, xMax: DEFAULT_PLOT_X_MAX } }]);
  });

  it("encodes a non-default plot range and restores it exactly", () => {
    const blocks: AnyBlock[] = [{ id: "pl2", type: "plot", props: { expression: "x^2", xMin: -5, xMax: 5 } }];
    const persisted = toPersistableBlocks(blocks);
    const text = (persisted[0].content as { text: string }[])[0].text;
    expect(text).toBe("x^2|-5|5");

    const restored = fromPersistedBlocks(persisted);
    expect(restored).toEqual([{ id: "pl2", type: "plot", props: { expression: "x^2", xMin: -5, xMax: 5 } }]);
  });

  it("leaves ordinary blocks and code blocks in other languages untouched", () => {
    const blocks: AnyBlock[] = [paragraph("hello"), codeBlock("javascript", "console.log(1)")];
    expect(toPersistableBlocks(blocks)).toEqual(blocks);
    expect(fromPersistedBlocks(blocks)).toEqual(blocks);
  });

  it("recurses into nested children", () => {
    const blocks: AnyBlock[] = [{ id: "wrap", type: "blockGroup", children: [{ id: "e2", type: "equation", props: { latex: "y=mx+b" } }] }];
    const persisted = toPersistableBlocks(blocks);
    expect(persisted[0].children?.[0]).toMatchObject({ type: "codeBlock", props: { language: "math" } });

    const restored = fromPersistedBlocks(persisted);
    expect(restored[0].children?.[0]).toEqual({ id: "e2", type: "equation", props: { latex: "y=mx+b" } });
  });
});
