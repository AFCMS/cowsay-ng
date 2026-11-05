import { describe, expect, it, vi } from "vitest";

import { constructBalloon } from "../src/balloon.ts";
import { layoutText } from "../src/layout.ts";
import { tokenize } from "../src/width.ts";

const options = { wrapColumn: 40, preserveWhitespace: false };
describe("Unicode terminal layout", () => {
  it.each([
    ["ASCII", 5],
    ["e\u0301", 1],
    ["中文", 4],
    ["·Ω—", 3],
    ["😀", 2],
    ["👩🏽‍💻", 2],
    ["🇫🇷", 2],
    ["1️⃣", 2],
    ["♥️", 2],
    ["♥︎", 1],
    ["\u0301", 0],
    ["\u200b", 0],
    ["\u{1faea}", 2],
  ])("measures %s as %s terminal columns", (text, width) => {
    expect(layoutText(text as string, options).width).toBe(width);
  });
  it("wraps complete graphemes, including a grapheme wider than the wrap column", () => {
    const graphemes = layoutText("👩🏽‍💻中é", { ...options, wrapColumn: 3 });
    const wideCharacters = layoutText("中文", { ...options, wrapColumn: 2 });

    expect(graphemes.lines.map((line) => line.text)).toEqual(["👩🏽‍💻", "中", "é"]);
    expect(wideCharacters.lines.map((line) => line.text)).toEqual(["中", "文"]);
  });
  it("expands tabs using terminal columns and keeps explicit blank lines", () => {
    expect(layoutText("中\tx\n\n", { ...options, preserveWhitespace: true }).lines).toEqual([
      { text: "中      x", width: 9 },
      { text: "", width: 0 },
      { text: "", width: 0 },
    ]);
  });
  it("initializes the segmenter only for Unicode and reuses it", async () => {
    vi.resetModules();
    const spy = vi.spyOn(Intl, "Segmenter");
    const { tokenize: fresh } = await import("../src/width.ts");
    fresh("ASCII\t\x1b[31mstyled\x1b[0m");
    expect(spy).not.toHaveBeenCalled();
    fresh("中");
    fresh("😀");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
  it("handles large wrapped input without a spread argument limit", () => {
    const layout = layoutText("x".repeat(150_000), { ...options, wrapColumn: 2 });
    expect(layout.lines).toHaveLength(150_000);
    expect(layout.width).toBe(1);
  });
});

describe("terminal styling", () => {
  it("closes and restores SGR before padding and borders", () => {
    const layout = layoutText("\x1b[31mred blue\x1b[0m", { ...options, wrapColumn: 5 });
    const balloon = constructBalloon(layout, false);
    const expected = [
      " ______",
      "/ \x1b[31mred\x1b[0m  \\",
      "\\ \x1b[31mblue\x1b[0m /",
      " ------",
      "",
    ].join("\n");

    expect(balloon).toBe(expected);
  });
  it.each(["\x07", "\x1b\\"])("preserves OSC 8 hyperlinks terminated by %s", (end) => {
    const open = `\x1b]8;id=1;https://example.com/a b${end}`;
    const close = `\x1b]8;;${end}`;
    const layout = layoutText(open + "one two" + close, { ...options, wrapColumn: 4 });
    expect(layout.width).toBe(3);
    const result = constructBalloon(layout, false);
    expect(result).toContain(open + "one\x1b]8;;\x1b\\ \\\n");
    expect(result).toContain("\\ " + open + "two" + close + " /\n");
  });
  it("keeps styles embedded inside a single grapheme intact", () => {
    const text = "👩\x1b[31m🏽‍💻";
    expect(tokenize(text)).toEqual([{ text, width: 2 }]);

    const layout = layoutText(text + "中", { ...options, wrapColumn: 3 });
    expect(layout.lines.map((line) => line.text)).toEqual([text, "中"]);
  });
});
