import { describe, it, expect } from "vitest";
import {
  encodeFloatingHeader,
  parseFloatingHeader,
  toPersistableFloatingBlocks,
  fromPersistedFloatingBlocks,
  DEFAULT_FLOATING_WIDTH,
  DEFAULT_FLOATING_X,
  DEFAULT_FLOATING_Y,
} from "./floatingBlocks";
import type { AnyBlock } from "./mathBlocks";

describe("encodeFloatingHeader / parseFloatingHeader", () => {
  it("round-trips a header", () => {
    const header = { x: 120, y: 340, width: 260 };
    expect(parseFloatingHeader(encodeFloatingHeader(header))).toEqual(header);
  });

  it("returns null for a malformed header line", () => {
    expect(parseFloatingHeader("not,a,header,line")).toBeNull();
    expect(parseFloatingHeader("abc,def")).toBeNull();
    expect(parseFloatingHeader("")).toBeNull();
  });
});

describe("toPersistableFloatingBlocks / fromPersistedFloatingBlocks", () => {
  it("converts a floatingText block into a floating-language codeBlock and back", () => {
    const block: AnyBlock = {
      id: "b1",
      type: "floatingText",
      props: { x: 100, y: 200, width: 250 },
      content: [{ type: "text", text: "hello world", styles: {} }],
    };
    const persistable = toPersistableFloatingBlocks([block], () => "hello world");
    expect(persistable).toHaveLength(1);
    expect(persistable[0].type).toBe("codeBlock");
    expect(persistable[0].props?.language).toBe("floating");

    const restored = fromPersistedFloatingBlocks(persistable, (md) => [{ type: "text", text: md, styles: {} }]);
    expect(restored).toHaveLength(1);
    expect(restored[0].type).toBe("floatingText");
    expect(restored[0].props).toEqual({ x: 100, y: 200, width: 250 });
    expect(restored[0].content).toEqual([{ type: "text", text: "hello world", styles: {} }]);
  });

  it("leaves non-floating blocks untouched", () => {
    const block: AnyBlock = { id: "p1", type: "paragraph", content: [{ type: "text", text: "hi", styles: {} }] };
    expect(toPersistableFloatingBlocks([block], () => "")).toEqual([block]);
    expect(fromPersistedFloatingBlocks([block], () => [])).toEqual([block]);
  });

  it("falls back to default position/size when a floating codeBlock's header line is malformed", () => {
    const badBlock: AnyBlock = {
      id: "b2",
      type: "codeBlock",
      props: { language: "floating" },
      content: [{ type: "text", text: "garbage-header\n\nsome text", styles: {} }],
    };
    const restored = fromPersistedFloatingBlocks([badBlock], (md) => [{ type: "text", text: md, styles: {} }]);
    expect(restored[0].props).toEqual({ x: DEFAULT_FLOATING_X, y: DEFAULT_FLOATING_Y, width: DEFAULT_FLOATING_WIDTH });
  });

  it("recurses into children on both directions", () => {
    const parentToPersist: AnyBlock = {
      id: "parent",
      type: "paragraph",
      content: [],
      children: [
        {
          id: "child",
          type: "floatingText",
          props: { x: 10, y: 20, width: 200 },
          content: [{ type: "text", text: "nested", styles: {} }],
        },
      ],
    };
    const persistable = toPersistableFloatingBlocks([parentToPersist], () => "nested");
    expect(persistable[0].children?.[0].type).toBe("codeBlock");

    const restored = fromPersistedFloatingBlocks(persistable, (md) => [{ type: "text", text: md, styles: {} }]);
    expect(restored[0].children?.[0].type).toBe("floatingText");
    expect(restored[0].children?.[0].props).toEqual({ x: 10, y: 20, width: 200 });
  });
});
