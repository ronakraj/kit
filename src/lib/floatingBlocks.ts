import type { AnyBlock } from "./mathBlocks";

export const DEFAULT_FLOATING_WIDTH = 240;
export const DEFAULT_FLOATING_X = 40;
export const DEFAULT_FLOATING_Y = 40;

export interface FloatingHeader {
  x: number;
  y: number;
  width: number;
}

/** Encodes a floating block's position/size as a compact single line, e.g. "120,340,240". */
export function encodeFloatingHeader(h: FloatingHeader): string {
  return `${h.x},${h.y},${h.width}`;
}

/** Inverse of `encodeFloatingHeader`. Returns null (never throws) for a malformed/missing header line, so callers can fall back to sane defaults. */
export function parseFloatingHeader(line: string): FloatingHeader | null {
  const parts = line.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width] = parts;
  return { x, y, width };
}

function plainTextContent(text: string): { type: "text"; text: string; styles: Record<string, never> }[] {
  return [{ type: "text", text, styles: {} }];
}

function textOf(block: AnyBlock): string {
  if (!Array.isArray(block.content)) return "";
  return block.content
    .map((c) => (c && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
    .join("");
}

/**
 * Converts custom `floatingText` blocks into plain `codeBlock`s tagged with
 * language "floating", for markdown persistence — the same portable,
 * plain-text approach `mathBlocks.ts` uses for equation/plot blocks. Unlike
 * those, a floating block's body is real rich inline content (bold/italic/
 * links), not a trivial string prop, so converting it to markdown text needs
 * the live editor's own serializer. Rather than importing `@blocknote/core`
 * into this otherwise-pure module, the caller supplies `serializeInline`
 * (typically a thin wrapper around `editor.blocksToMarkdownLossy` called on
 * the block with its type swapped to "paragraph" — paragraphs and
 * `floatingText` share the same inline-content shape, so that swap is safe
 * purely for serialization purposes). Every other block passes through
 * untouched.
 */
export function toPersistableFloatingBlocks(blocks: AnyBlock[], serializeInline: (block: AnyBlock) => string): AnyBlock[] {
  return blocks.map((block) => {
    if (block.type === "floatingText") {
      const props = block.props ?? {};
      const header = encodeFloatingHeader({
        x: typeof props.x === "number" ? props.x : DEFAULT_FLOATING_X,
        y: typeof props.y === "number" ? props.y : DEFAULT_FLOATING_Y,
        width: typeof props.width === "number" ? props.width : DEFAULT_FLOATING_WIDTH,
      });
      const body = serializeInline(block).trim();
      return { id: block.id, type: "codeBlock", props: { language: "floating" }, content: plainTextContent(`${header}\n\n${body}`) };
    }
    if (block.children && block.children.length > 0) {
      return { ...block, children: toPersistableFloatingBlocks(block.children, serializeInline) };
    }
    return block;
  });
}

/**
 * Inverse of `toPersistableFloatingBlocks`. `parseInline` mirrors the same
 * editor-dependency-injection reasoning: reconstructing rich inline content
 * from markdown text needs the live editor's markdown parser, so it's
 * supplied by the caller (typically `editor.tryParseMarkdownToBlocks(...)`
 * on a throwaway paragraph, taking its `.content`) rather than imported here.
 */
export function fromPersistedFloatingBlocks(blocks: AnyBlock[], parseInline: (markdown: string) => unknown): AnyBlock[] {
  return blocks.map((block) => {
    if (block.type === "codeBlock" && block.props?.language === "floating") {
      const raw = textOf(block);
      const newlineIndex = raw.indexOf("\n");
      const headerLine = newlineIndex === -1 ? raw : raw.slice(0, newlineIndex);
      const header =
        parseFloatingHeader(headerLine) ?? { x: DEFAULT_FLOATING_X, y: DEFAULT_FLOATING_Y, width: DEFAULT_FLOATING_WIDTH };
      const bodyText = newlineIndex === -1 ? "" : raw.slice(newlineIndex + 1).replace(/^\n/, "");
      return {
        id: block.id,
        type: "floatingText",
        props: header as unknown as Record<string, unknown>,
        content: parseInline(bodyText),
      };
    }
    if (block.children && block.children.length > 0) {
      return { ...block, children: fromPersistedFloatingBlocks(block.children, parseInline) };
    }
    return block;
  });
}
