import { useRef, useState } from "react";
import { BlockNoteSchema, BlockNoteEditor, type BlockConfig, type PartialBlock } from "@blocknote/core";
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from "@blocknote/react";
import { mathBlockSpecs } from "./mathBlocks";
import { DEFAULT_FLOATING_WIDTH } from "../lib/floatingBlocks";

const floatingTextConfig = {
  type: "floatingText",
  propSchema: {
    x: { default: 40 },
    y: { default: 40 },
    width: { default: DEFAULT_FLOATING_WIDTH },
  },
  content: "inline",
} satisfies BlockConfig;

/** Named as a proper component (not inline in `render:`) so ESLint's rules-of-hooks recognizes the hooks below. */
function FloatingTextContent({ block, editor, contentRef }: ReactCustomBlockRenderProps<typeof floatingTextConfig>) {
  const { x, y, width } = block.props;
  const dragOrigin = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragOrigin.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };
    setDragPos({ x, y });

    const handleMove = (ev: PointerEvent) => {
      const origin = dragOrigin.current;
      if (!origin) return;
      setDragPos({ x: origin.origX + (ev.clientX - origin.startX), y: origin.origY + (ev.clientY - origin.startY) });
    };
    const handleUp = (ev: PointerEvent) => {
      const origin = dragOrigin.current;
      if (origin) {
        const newX = Math.max(0, origin.origX + (ev.clientX - origin.startX));
        const newY = Math.max(0, origin.origY + (ev.clientY - origin.startY));
        editor.updateBlock(block, { props: { x: newX, y: newY } });
      }
      dragOrigin.current = null;
      setDragPos(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  // While dragging, follow the pointer via local state for a smooth feel;
  // the committed x/y (from block.props) only updates on pointer-up.
  const renderX = dragPos?.x ?? x;
  const renderY = dragPos?.y ?? y;

  return (
    <div
      className="floating-text-block"
      style={{
        position: "absolute",
        left: renderX,
        top: renderY,
        width,
        background: "var(--bg-panel)",
        borderColor: "var(--border)",
        zIndex: dragPos ? 30 : 10,
      }}
    >
      <div
        className="floating-text-handle"
        style={{ color: "var(--text-muted)" }}
        onPointerDown={handlePointerDown}
        title="Drag to move"
      >
        ⠿
      </div>
      <div ref={contentRef} className="floating-text-content" style={{ color: "var(--text)" }} />
    </div>
  );
}

const floatingTextBuilder = createReactBlockSpec(floatingTextConfig, {
  render: FloatingTextContent,
});

/** Combined schema: every default block, plus the math (`equation`/`plot`) and `floatingText` custom blocks. */
export const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...mathBlockSpecs,
    floatingText: floatingTextBuilder(),
  },
});

export type EditorType = BlockNoteEditor<
  typeof editorSchema.blockSchema,
  typeof editorSchema.inlineContentSchema,
  typeof editorSchema.styleSchema
>;
export type EditorPartialBlock = PartialBlock<
  typeof editorSchema.blockSchema,
  typeof editorSchema.inlineContentSchema,
  typeof editorSchema.styleSchema
>;

export function createHeadlessEditor(): BlockNoteEditor<
  typeof editorSchema.blockSchema,
  typeof editorSchema.inlineContentSchema,
  typeof editorSchema.styleSchema
> {
  return BlockNoteEditor.create({ schema: editorSchema });
}
