import { useMemo } from "react";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  insertOrUpdateBlockForSlashMenu,
  type BlockConfig,
  type BlockNoteEditor,
  type PartialBlock,
} from "@blocknote/core";
import {
  createReactBlockSpec,
  type DefaultReactSuggestionItem,
  type ReactCustomBlockRenderProps,
} from "@blocknote/react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { samplePlot, DEFAULT_PLOT_X_MIN, DEFAULT_PLOT_X_MAX, type PlotPoint } from "../lib/mathBlocks";

const equationBlockBuilder = createReactBlockSpec(
  {
    type: "equation",
    propSchema: {
      latex: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const latex = block.props.latex;
      const html = latex.trim() ? katex.renderToString(latex, { throwOnError: false, displayMode: true }) : "";
      return (
        <div className="math-block" style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}>
          <input
            value={latex}
            onChange={(e) => editor.updateBlock(block, { props: { latex: e.target.value } })}
            placeholder="LaTeX, e.g. \frac{1}{2} or x^2 + y^2 = r^2"
            className="math-block-input"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          />
          {html ? (
            <div className="math-block-output" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              Enter a LaTeX expression above.
            </div>
          )}
        </div>
      );
    },
  }
);

function PlotSvg({ points }: { points: PlotPoint[] }) {
  const width = 420;
  const height = 180;
  const padding = 28;

  const validYs = points.map((p) => p.y).filter((y): y is number => y !== null);
  if (validYs.length === 0) {
    return (
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        No real values in this range.
      </div>
    );
  }

  const xs = points.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  let yMin = Math.min(...validYs);
  let yMax = Math.max(...validYs);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yPad = (yMax - yMin) * 0.1;
  yMin -= yPad;
  yMax += yPad;

  const toSvgX = (x: number) => padding + ((x - xMin) / (xMax - xMin)) * (width - 2 * padding);
  const toSvgY = (y: number) => height - padding - ((y - yMin) / (yMax - yMin)) * (height - 2 * padding);

  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ x: p.x, y: p.y });
    }
  }
  if (current.length) segments.push(current);

  const zeroY = yMin <= 0 && yMax >= 0 ? toSvgY(0) : null;
  const zeroX = xMin <= 0 && xMax >= 0 ? toSvgX(0) : null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ display: "block" }}>
      {zeroY !== null && <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="var(--border)" strokeWidth={1} />}
      {zeroX !== null && <line x1={zeroX} y1={padding} x2={zeroX} y2={height - padding} stroke="var(--border)" strokeWidth={1} />}
      <rect x={padding} y={padding} width={width - 2 * padding} height={height - 2 * padding} fill="none" stroke="var(--border)" strokeWidth={1} />
      {segments.map((seg, i) => (
        <polyline
          key={i}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          points={seg.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(" ")}
        />
      ))}
      <text x={padding} y={height - 6} fontSize={9} fill="var(--text-muted)">
        {xMin.toFixed(1)}
      </text>
      <text x={width - padding} y={height - 6} textAnchor="end" fontSize={9} fill="var(--text-muted)">
        {xMax.toFixed(1)}
      </text>
      <text x={4} y={padding + 8} fontSize={9} fill="var(--text-muted)">
        {yMax.toFixed(1)}
      </text>
      <text x={4} y={height - padding} fontSize={9} fill="var(--text-muted)">
        {yMin.toFixed(1)}
      </text>
    </svg>
  );
}

const plotBlockConfig = {
  type: "plot",
  propSchema: {
    expression: { default: "x^2" },
    xMin: { default: DEFAULT_PLOT_X_MIN },
    xMax: { default: DEFAULT_PLOT_X_MAX },
  },
  content: "none",
} satisfies BlockConfig;

/** Named as a proper component (not inline in `render:`) so ESLint's rules-of-hooks recognizes the `useMemo` below. */
function PlotBlockContent({ block, editor }: ReactCustomBlockRenderProps<typeof plotBlockConfig>) {
  const { expression, xMin, xMax } = block.props;
  const points = useMemo(() => samplePlot(expression, xMin, xMax), [expression, xMin, xMax]);

  return (
    <div className="math-block" style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}>
      <div className="mb-2 flex items-center gap-2">
        <input
          value={expression}
          onChange={(e) => editor.updateBlock(block, { props: { expression: e.target.value } })}
          placeholder="Expression in x, e.g. sin(x)"
          className="math-block-input"
          style={{ borderColor: "var(--border)", color: "var(--text)", flex: 1 }}
        />
        <input
          type="number"
          value={xMin}
          onChange={(e) => editor.updateBlock(block, { props: { xMin: Number(e.target.value) } })}
          className="math-block-range-input"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          to
        </span>
        <input
          type="number"
          value={xMax}
          onChange={(e) => editor.updateBlock(block, { props: { xMax: Number(e.target.value) } })}
          className="math-block-range-input"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        />
      </div>
      <PlotSvg points={points} />
    </div>
  );
}

const plotBlockBuilder = createReactBlockSpec(plotBlockConfig, {
  render: PlotBlockContent,
});

/** Exposed (alongside the already-created `mathSchema`) so other modules can compose a combined schema that includes these block specs plus their own. */
export const mathBlockSpecs = {
  ...defaultBlockSpecs,
  equation: equationBlockBuilder(),
  plot: plotBlockBuilder(),
};

export const mathSchema = BlockNoteSchema.create({
  blockSpecs: mathBlockSpecs,
});

export type MathEditor = BlockNoteEditor<typeof mathSchema.blockSchema, typeof mathSchema.inlineContentSchema, typeof mathSchema.styleSchema>;
export type MathPartialBlock = PartialBlock<typeof mathSchema.blockSchema, typeof mathSchema.inlineContentSchema, typeof mathSchema.styleSchema>;

/** Default slash-menu items plus "Equation" and "Plot", for use with a manually-controlled `SuggestionMenuController`. */
export function getMathSlashMenuItems(
  editor: MathEditor,
  defaultItems: DefaultReactSuggestionItem[]
): DefaultReactSuggestionItem[] {
  return [
    ...defaultItems,
    {
      title: "Equation",
      subtext: "Insert a LaTeX equation",
      aliases: ["latex", "math", "formula", "equation"],
      group: "Math",
      onItemClick: () => {
        const newBlock: MathPartialBlock = { type: "equation", props: { latex: "" } };
        insertOrUpdateBlockForSlashMenu(editor, newBlock);
      },
    },
    {
      title: "Plot",
      subtext: "Plot a function of x",
      aliases: ["graph", "chart", "function", "plot"],
      group: "Math",
      onItemClick: () => {
        const newBlock: MathPartialBlock = {
          type: "plot",
          props: { expression: "x^2", xMin: DEFAULT_PLOT_X_MIN, xMax: DEFAULT_PLOT_X_MAX },
        };
        insertOrUpdateBlockForSlashMenu(editor, newBlock);
      },
    },
  ];
}
