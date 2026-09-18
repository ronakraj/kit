import { evaluate } from "mathjs";

export const DEFAULT_PLOT_X_MIN = -10;
export const DEFAULT_PLOT_X_MAX = 10;
const PLOT_SAMPLES = 200;

/**
 * Safely evaluates a math expression in terms of `x` at a single point using
 * mathjs's parser/evaluator (never JS `eval`/`Function`, since expressions may
 * come from arbitrary note content). Never throws: invalid expressions or
 * non-real results (e.g. sqrt of a negative number) both just return null.
 */
export function safeEvaluateAt(expression: string, x: number): number | null {
  try {
    const result = evaluate(expression, { x });
    if (typeof result !== "number" || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

export interface PlotPoint {
  x: number;
  y: number | null;
}

/**
 * Samples `expression` evenly across [xMin, xMax]. Points where evaluation
 * fails or isn't a finite real number get `y: null` so callers can break the
 * plotted line there instead of drawing a bogus segment through them.
 */
export function samplePlot(expression: string, xMin: number, xMax: number, samples = PLOT_SAMPLES): PlotPoint[] {
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin || samples < 2) return [];
  const step = (xMax - xMin) / (samples - 1);
  const points: PlotPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const x = xMin + step * i;
    points.push({ x, y: safeEvaluateAt(expression, x) });
  }
  return points;
}

/**
 * Minimal, structurally-typed stand-in for BlockNote's Block/PartialBlock
 * shape. Kept independent of @blocknote/core's generics so this module (and
 * its tests) don't need to know about the app's custom schema — callers cast
 * at the boundary.
 */
export interface AnyBlock {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: AnyBlock[];
}

function plainTextContent(text: string): { type: "text"; text: string; styles: Record<string, never> }[] {
  return [{ type: "text", text, styles: {} }];
}

function textOf(block: AnyBlock): string {
  if (!Array.isArray(block.content)) return "";
  return block.content.map((c) => (c && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : "")).join("");
}

/**
 * Converts custom `equation`/`plot` blocks into plain `codeBlock`s tagged
 * with language "math"/"plot", for markdown persistence — keeps notes as
 * plain, portable text files rather than relying on BlockNote's custom-block
 * markdown serialization. Every other block (including normal code blocks in
 * other languages) passes through untouched.
 */
export function toPersistableBlocks(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.map((block) => {
    if (block.type === "equation") {
      const latex = typeof block.props?.latex === "string" ? block.props.latex : "";
      return { id: block.id, type: "codeBlock", props: { language: "math" }, content: plainTextContent(latex) };
    }
    if (block.type === "plot") {
      const expression = typeof block.props?.expression === "string" ? block.props.expression : "";
      const xMin = typeof block.props?.xMin === "number" ? block.props.xMin : DEFAULT_PLOT_X_MIN;
      const xMax = typeof block.props?.xMax === "number" ? block.props.xMax : DEFAULT_PLOT_X_MAX;
      const isDefaultRange = xMin === DEFAULT_PLOT_X_MIN && xMax === DEFAULT_PLOT_X_MAX;
      const encoded = isDefaultRange ? expression : `${expression}|${xMin}|${xMax}`;
      return { id: block.id, type: "codeBlock", props: { language: "plot" }, content: plainTextContent(encoded) };
    }
    if (block.children && block.children.length > 0) {
      return { ...block, children: toPersistableBlocks(block.children) };
    }
    return block;
  });
}

/**
 * The inverse of `toPersistableBlocks`: after parsing markdown back into
 * blocks, converts `codeBlock`s tagged "math"/"plot" into the custom
 * `equation`/`plot` blocks. A normal code block in any other language is left
 * exactly as-is.
 */
export function fromPersistedBlocks(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.map((block) => {
    if (block.type === "codeBlock" && block.props?.language === "math") {
      return { id: block.id, type: "equation", props: { latex: textOf(block) } };
    }
    if (block.type === "codeBlock" && block.props?.language === "plot") {
      const [expression = "", xMinRaw, xMaxRaw] = textOf(block).split("|");
      const xMin = xMinRaw !== undefined ? Number(xMinRaw) : DEFAULT_PLOT_X_MIN;
      const xMax = xMaxRaw !== undefined ? Number(xMaxRaw) : DEFAULT_PLOT_X_MAX;
      return {
        id: block.id,
        type: "plot",
        props: {
          expression,
          xMin: Number.isFinite(xMin) ? xMin : DEFAULT_PLOT_X_MIN,
          xMax: Number.isFinite(xMax) ? xMax : DEFAULT_PLOT_X_MAX,
        },
      };
    }
    if (block.children && block.children.length > 0) {
      return { ...block, children: fromPersistedBlocks(block.children) };
    }
    return block;
  });
}
