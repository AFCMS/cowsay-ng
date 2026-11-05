// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
import type { Cow } from "./types.ts";

type Slot = "thoughts" | "eyes" | "tongue";
type Part = string | Readonly<{ slot: Slot }>;
type Transform = "small" | "sus" | "three-eyes" | "udder";
type CompileFailure = (offset: number, message: string) => never;
interface Program {
  readonly parts: readonly Part[];
  readonly transform?: Transform;
}

const lineBoundaryPattern = /(?<=\n)/;
const heredocHeaderPattern =
  /^\s*\$the_cow\s*=\s*<<(?:(['"])([A-Za-z_]\w*)\1|([A-Za-z_]\w*))\s*;?\s*(?:#.*)?\r?\n?$/;
const ignoredLinePattern = /^\s*(?:#[^\n]*)?\s*$/;
const smallPreludePattern = /^\$eyes\s*=\s*"\.\."\s+unless\s*\(\s*\$eyes\s*\)\s*;$/;
const susPreludePattern = /^\$eyes\s*=\s*'  '\s+unless\s*\(\s*\$eyes\s+ne\s+'oo'\s*\)\s*;$/;
const threeEyesPreludePattern =
  /^\$extra\s*=\s*chop\(\s*\$eyes\s*\)\s*;\s*\$eyes\s*\.=\s*\(\s*\$extra\s+x\s+2\s*\)\s*;$/;
const udderPreludePattern =
  /^\$other_eye\s*=\s*chop\(\s*\$eyes\s*\)\s*;\s*\$eyes\s*\.=\s*" \$other_eye"\s*;$/;
const trailingNewlinePattern = /\r?\n$/;
const leadingNewlinePattern = /^\r?\n/;
const trailingCommentsPattern = /^\s*(?:#[^\n]*(?:\n|$)\s*)*$/;
const controlEscapeCharacterPattern = /[\x40-\x7f]/;
const octalDigitPattern = /[0-7]/;
const numericEscapePattern = /^(?:x\{([\da-fA-F]+)\}|x([\da-fA-F]{1,2})|([0-7]{1,3}))/;
const escapedPunctuationPattern = /[^\w\s]/;
const substitutionPattern = /^\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/;
const arrayInterpolationPattern = /[A-Za-z_{]/;
const escapes: Readonly<Record<string, string>> = {
  "\\": "\\",
  $: "$",
  "@": "@",
  n: "\n",
  r: "\r",
  t: "\t",
  f: "\f",
  b: "\b",
  a: "\x07",
  e: "\x1b",
  v: "\x0b",
};
const programs = new WeakMap<Cow, Program>();

/**
 * Recognizes only the four audited face preludes; all other executable statements fail.
 */
function parsePrelude(
  prelude: string,
  offset: number,
  fail: CompileFailure,
): Transform | undefined {
  const preamble = prelude.trim();

  if (smallPreludePattern.test(preamble)) {
    return "small";
  }
  if (susPreludePattern.test(preamble)) {
    return "sus";
  }
  if (threeEyesPreludePattern.test(preamble)) {
    return "three-eyes";
  }
  if (udderPreludePattern.test(preamble)) {
    return "udder";
  }
  if (preamble) {
    fail(offset, "Unsupported executable prelude");
  }
}

/**
 * Compiles a cowfile into an opaque, immutable template without executing code.
 *
 * Supports bare and double-quoted interpolating heredocs, single-quoted literal
 * heredocs, the supported face substitutions and escapes, and the audited
 * preludes used by the bundled cows. Rendering reuses the compiled parts without
 * reparsing the source.
 *
 * @param source - Raw cowfile text in the supported Perl template subset.
 * @param name - Source label used in error messages; defaults to `"cow"`.
 * @returns A reusable compiled cow for the synchronous core or asynchronous API.
 * @throws {TypeError} If `source` is not a string.
 * @throws {SyntaxError} If the source is malformed or contains unsupported syntax
 * or executable statements. The error includes the source label, line, and column.
 *
 * @example
 * ```ts
 * import source from "@afcms/cowsay-ng/cows/default.cow" with { type: "text" };
 *
 * const cow = compileCow(source, "default.cow");
 * ```
 */
export function compileCow(source: string, name = "cow"): Cow {
  if (typeof source !== "string") {
    throw new TypeError("cow source must be a string");
  }

  /**
   * Converts an absolute source offset into a location-bearing compilation error.
   */
  const fail: CompileFailure = (offset, message) => {
    const before = source.slice(0, offset);
    const line = before.split("\n").length;
    const column = offset - before.lastIndexOf("\n");
    throw new SyntaxError(`${name}:${line}:${column}: ${message}`);
  };

  const lines = source.split(lineBoundaryPattern);
  let offset = 0;
  let prelude = "";
  let preludeOffset = 0;
  let header: RegExpMatchArray | null = null;
  for (const line of lines) {
    header = line.match(heredocHeaderPattern);
    if (header) {
      offset += line.length;
      break;
    }
    if (!ignoredLinePattern.test(line)) {
      if (!prelude) {
        preludeOffset = offset;
      }

      prelude += line;
    }
    offset += line.length;
  }
  if (!header) {
    fail(0, "Expected a $the_cow heredoc assignment");
  }

  const transform = parsePrelude(prelude, preludeOffset, fail);
  const delimiter = header![2] ?? header![3]!;
  let end = offset;
  let terminated = false;
  for (const line of source.slice(offset).split(lineBoundaryPattern)) {
    if (line.replace(trailingNewlinePattern, "") === delimiter) {
      terminated = true;
      break;
    }
    end += line.length;
  }
  if (!terminated) {
    fail(offset, `Unterminated heredoc ${delimiter}`);
  }

  const tail = source.slice(end + delimiter.length).replace(leadingNewlinePattern, "");
  if (!trailingCommentsPattern.test(tail)) {
    fail(source.length - tail.length, "Unexpected statement after heredoc");
  }

  const body = source.slice(offset, end);
  const interpolate = header![1] !== "'";
  const parts = compileTemplate(body, offset, interpolate, fail);
  const cow = Object.freeze(Object.create(null)) as Cow;

  programs.set(cow, Object.freeze({ parts, transform }));
  return cow;
}

/**
 * Compiles heredoc contents into frozen literal spans and substitution slots.
 */
function compileTemplate(
  body: string,
  offset: number,
  interpolate: boolean,
  fail: CompileFailure,
): readonly Part[] {
  const parts: Part[] = [];
  let literal = "";

  /**
   * Appends the accumulated literal before a substitution or the end of the body.
   */
  const flush = () => {
    if (literal) {
      parts.push(literal);
      literal = "";
    }
  };

  if (!interpolate) {
    literal = body;
  } else {
    for (let i = 0; i < body.length;) {
      const character = body[i]!;
      if (character === "\\") {
        const next = body[++i];
        if (next !== undefined && Object.hasOwn(escapes, next)) {
          literal += escapes[next];
          i++;
        } else if (
          next === "c" &&
          body[i + 1] &&
          controlEscapeCharacterPattern.test(body[i + 1]!)
        ) {
          literal += String.fromCharCode(body.charCodeAt(i + 1) & 31);
          i += 2;
        } else if (next === "x" || (next !== undefined && octalDigitPattern.test(next))) {
          const match = body.slice(i).match(numericEscapePattern);
          if (!match) {
            fail(offset + i - 1, "Invalid numeric escape");
          }

          const digits = match![1] ?? match![2] ?? match![3]!;
          const radix = match![3] ? 8 : 16;
          const point = Number.parseInt(digits, radix);
          const isSurrogate = point >= 0xd800 && point <= 0xdfff;

          if (point > 0x10ffff || isSurrogate) {
            fail(offset + i - 1, "Invalid Unicode escape");
          }

          literal += String.fromCodePoint(point);
          i += match![0].length;
        } else if (next !== undefined && escapedPunctuationPattern.test(next)) {
          literal += next;
          i++;
        } else {
          fail(offset + i - 1, "Unsupported escape sequence");
        }
      } else if (character === "$") {
        const match = body.slice(i).match(substitutionPattern);
        if (!match) {
          fail(offset + i, "Unsupported interpolation");
        }

        const slot = match![1] ?? match![2]!;
        if (slot === "thoughts" || slot === "eyes" || slot === "tongue") {
          flush();
          parts.push(Object.freeze({ slot }));
        } else if (slot !== "eye") {
          fail(offset + i, `Unsupported substitution $${slot}`);
        }

        // chami.cow's uninitialized $eye intentionally contributes no text.
        i += match![0].length;
        if (body[i] === "[" || body[i] === "{") {
          fail(offset + i, "Unsupported interpolation expression");
        }
      } else if (character === "@" && body[i + 1] === "+") {
        // bill.cow interpolates Perl's empty @+ match-offset array.
        i += 2;
      } else if (character === "@" && arrayInterpolationPattern.test(body[i + 1] ?? "")) {
        fail(offset + i, "Unsupported array interpolation; escape literal at-signs");
      } else {
        literal += character;
        i++;
      }
    }
  }

  flush();
  return Object.freeze(parts);
}

/**
 * Substitutes the selected face and connector into a previously compiled template.
 */
export function renderCow(
  cow: Cow,
  face: { eyes: string; tongue: string },
  thoughts: string,
): string {
  const program = programs.get(cow);
  if (!program) {
    throw new TypeError("cow must be a compiled Cow from compileCow or a cow entry point");
  }

  let { eyes } = face;
  switch (program.transform) {
    case "small":
      if (!eyes || eyes === "0") {
        eyes = "..";
      }
      break;
    case "sus":
      if (eyes === "oo") {
        eyes = "  ";
      }
      break;
    case "three-eyes": {
      const points = Array.from(eyes);
      const last = points.pop() ?? "";
      eyes = points.join("") + last.repeat(2);
      break;
    }
    case "udder": {
      const points = Array.from(eyes);
      const last = points.pop() ?? "";
      eyes = points.join("") + " " + last;
      break;
    }
  }

  const values = { thoughts, eyes, tongue: face.tongue };
  const renderedParts = program.parts.map((part) => {
    if (typeof part === "string") {
      return part;
    }

    return values[part.slot];
  });

  return renderedParts.join("");
}
