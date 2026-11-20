import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseCliArgs } from "../src/cli/args.ts";
import { compileCow, say, think } from "../src/core.ts";
import { selectFace } from "../src/face.ts";
import type { Cow, FaceMode } from "../src/types.ts";
import fixture from "./fixtures/perl.json" with { type: "json" };

const cows = new Map<string, Cow>();
const sourceLocationPattern = /unsafe\.cow:\d+:\d+:/;

/**
 * Compiles each fixture cow once so reference cases share the same immutable template.
 */
function cow(name = "default") {
  if (!cows.has(name)) {
    const file = new URL(`../src/cows/${name}.cow`, import.meta.url);
    const source = readFileSync(file, "utf8");
    cows.set(name, compileCow(source, name));
  }

  return cows.get(name)!;
}

describe("pinned cowsay-org reference output", () => {
  it.each(fixture.cases)("$label", (test) => {
    const parsed = parseCliArgs(test.args);
    const text = test.text.endsWith("\n") ? test.text.slice(0, -1) : test.text;
    const render = test.thought ? think : say;
    const actual = render(text, { ...parsed.options, cow: cow(parsed.cow) });

    expect(actual).toBe(test.output);
  });
});

describe("safe compilation", () => {
  it("ignores whitespace and comment lines before the heredoc", () => {
    const compiled = compileCow(" \t\r\n\u00a0\u2028\n \t# comment\r\n$the_cow = <<EOC;\nx\nEOC\n");
    expect(say("", { cow: compiled })).toContain("x\n");
  });
  it.each(["", "$the_cow=<<A"])(
    "rejects long whitespace runs after %j without excessive backtracking",
    (prefix) => {
      const compiler = new URL("../src/compiler.ts", import.meta.url).href;
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `import assert from "node:assert/strict";
import { compileCow } from ${JSON.stringify(compiler)};
assert.throws(() => compileCow(${JSON.stringify(prefix)} + " ".repeat(100_000) + "!"), /Expected a \\$the_cow heredoc assignment/);`,
        ],
        { encoding: "utf8", timeout: 2000 },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
    },
  );
  it.each(["", ";", " \t", " \t; \t", " # comment", " ; # comment"])(
    "accepts header suffix %j with each delimiter and line ending",
    (suffix) => {
      for (const delimiter of ["EOC", '"EOC"', "'EOC'"]) {
        for (const newline of ["\n", "\r\n"]) {
          const compiled = compileCow(
            ` \t$the_cow \t= \t<<${delimiter}${suffix}${newline}x${newline}EOC${newline}`,
          );
          expect(say("", { cow: compiled })).toContain(`x${newline}`);
        }
      }
    },
  );
  it("accepts long whitespace runs in valid headers", () => {
    const compiled = compileCow(`$the_cow=<<A${" ".repeat(100_000)}\nx\nA\n`);
    expect(say("", { cow: compiled })).toContain("x\n");
  });
  it("keeps substitutions literal and compiled cows opaque, immutable, and reusable", () => {
    const compiled = compileCow("$the_cow = <<EOC;\n${eyes} $tongue $thoughts\\n\nEOC\n");
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.keys(compiled)).toEqual([]);
    expect(say("", { cow: compiled, eyes: "$&", tongue: "$$" })).toContain("$& $$ \\\n\n");
    expect(think("", { cow: compiled, eyes: "😀😃😄" })).toContain("😀😃    o\n\n");
  });
  it("respects bare, double, and single quoted heredocs", () => {
    for (const delimiter of ["EOC", '"EOC"']) {
      const compiled = compileCow(
        `$the_cow = <<${delimiter};\n$eyes \\$eyes \\@ \\\\ \\t \\e \\a \\b \\r \\f \\cA \\x{1f600} \\101\nEOC\n`,
      );
      expect(say("", { cow: compiled })).toContain(
        "oo $eyes @ \\ \t \x1b \x07 \b \r \f \x01 😀 A\n",
      );
    }
    expect(say("", { cow: compileCow("$the_cow = <<'EOC';\n$eyes \\n\nEOC\n") })).toContain(
      "$eyes \\n\n",
    );
  });
  it.each([
    'system("whoami");\n$the_cow = <<EOC;\nx\nEOC\n',
    '$the_cow = <<EOC;\nx\nEOC\nsystem("whoami");',
    "$the_cow = `whoami`;",
    "$the_cow = <<EOC;\n$ENV{HOME}\nEOC\n",
    '$the_cow = <<EOC;\n${\\system("id")}\nEOC\n',
    "$the_cow = <<EOC;\n$eyes[0]\nEOC\n",
    "$the_cow = <<EOC;\n@dangerous\nEOC\n",
    "$the_cow = <<EOC;\n\\Lunsupported\nEOC\n",
    "$the_cow = <<EOC;\nunterminated\n",
  ])("rejects executable or unsupported syntax with a location", (source) => {
    expect(() => compileCow(source, "unsafe.cow")).toThrow(sourceLocationPattern);
  });
  it("rejects forged cows and nonstring source", () => {
    expect(() => say("", { cow: {} as Cow })).toThrow("compiled Cow");
    expect(() => compileCow(null as unknown as string)).toThrow("string");
  });
});

describe("options and faces", () => {
  it.each([0, 1, -1, 2.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid wrap column %s",
    (wrapColumn) => {
      expect(() => say("", { cow: cow(), wrapColumn })).toThrow("integer of at least 2");
    },
  );
  it("requires strings and validates modern options", () => {
    expect(() => say(123 as unknown as string, { cow: cow() })).toThrow("text must be a string");
    expect(() => say("", { cow: cow(), eyes: 2 as unknown as string })).toThrow(
      "eyes must be a string",
    );
    expect(() => say("", { cow: cow(), tongue: null as unknown as string })).toThrow(
      "tongue must be a string",
    );
    expect(() => say("", { cow: cow(), mode: "angry" as FaceMode })).toThrow("Unknown face mode");
    expect(() => say("", { cow: cow(), preserveWhitespace: 1 as unknown as boolean })).toThrow(
      "boolean",
    );
  });
  it("truncates faces by Unicode code point and applies mood overrides", () => {
    expect(selectFace({ eyes: "😀😃😄", tongue: "😛😜😝" })).toEqual({
      eyes: "😀😃",
      tongue: "😛😜",
    });
    expect(selectFace({ mode: "dead", eyes: "!!", tongue: "VV" })).toEqual({
      eyes: "xx",
      tongue: "U ",
    });
    expect(selectFace({ mode: "young", tongue: "VV" })).toEqual({ eyes: "..", tongue: "VV" });
  });
});
