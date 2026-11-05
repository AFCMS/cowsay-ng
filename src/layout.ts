// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
import { tokenize } from "./width.ts";
import type { Token } from "./width.ts";

interface Line {
  readonly text: string;
  readonly width: number;
}
export interface Layout {
  readonly lines: readonly Line[];
  readonly width: number;
}
const space: Token = { text: " ", width: 1 };
const whitespacePattern = /^\s+$/u;

/**
 * Recognizes visible whitespace while excluding terminal metadata.
 */
function isWhitespace(token: Token): boolean {
  return !token.escape && whitespacePattern.test(token.text);
}

/**
 * Splits at newline-plus-whitespace boundaries and folds spaces like Text::Wrap::fill.
 */
function splitParagraphs(tokens: Token[]): Token[][] {
  const result: Token[][] = [[]];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const next = tokens[i + 1];
    const isNewline = token.text === "\n" || token.text === "\r\n";

    if (isNewline && next !== undefined && isWhitespace(next)) {
      while (tokens[i + 1] && isWhitespace(tokens[i + 1]!)) {
        i++;
      }

      result.push([]);
      continue;
    }

    const paragraph = result.at(-1)!;
    if (isWhitespace(token)) {
      if (paragraph.at(-1) !== space) {
        paragraph.push(space);
      }
    } else {
      paragraph.push(token);
    }
  }

  while (result.at(-1)?.length === 0) {
    result.pop();
  }

  return result;
}

/**
 * Wraps one paragraph using cached widths, preserving graphemes and Perl's trailing-space behavior.
 */
function wrapParagraph(tokens: Token[], limit: number): Token[][] {
  const result: Token[][] = [];
  let start = 0;
  let lastContent = tokens.length - 1;

  while (lastContent >= 0 && isWhitespace(tokens[lastContent]!)) {
    lastContent--;
  }

  while (start <= lastContent) {
    let width = 0;
    let end = start;
    let lastSpace = -1;

    for (; end < tokens.length; end++) {
      const token = tokens[end]!;

      if (token === space && width <= limit) {
        lastSpace = end;
      }
      if (width + token.width > limit) {
        break;
      }

      width += token.width;
    }

    if (end === tokens.length) {
      result.push(tokens.slice(start, end));
      break;
    }

    if (lastSpace >= start) {
      const line = tokens.slice(start, lastSpace);
      start = lastSpace + 1;

      if (start === tokens.length) {
        line.push(space);
      }

      result.push(line);
    } else {
      // A wide grapheme must make progress even when the requested limit is one column.
      if (width === 0) {
        end++;
      }

      result.push(tokens.slice(start, end));
      start = end;
    }
  }
  return result;
}

/**
 * Keeps explicit lines and spaces, expanding tabs at eight terminal-column stops.
 */
function preserveWhitespace(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  let column = 0;

  for (const token of tokens) {
    if (token.text === "\n" || token.text === "\r\n") {
      lines.push([]);
      column = 0;
    } else if (token.text === "\t") {
      const count = 8 - (column % 8);

      for (let i = 0; i < count; i++) {
        lines.at(-1)!.push(space);
      }

      column += count;
    } else {
      lines.at(-1)!.push(token);
      column += token.width;
    }
  }
  return lines;
}

/**
 * Joins a token row and sums its existing measurements without measuring text again.
 */
function createLine(row: Token[]): Line {
  const parts: string[] = [];
  let width = 0;

  for (const token of row) {
    parts.push(token.text);
    width += token.width;
  }

  return { text: parts.join(""), width };
}

/**
 * Produces laid-out lines and their maximum width for balloon construction.
 */
export function layoutText(
  text: string,
  options: { wrapColumn: number; preserveWhitespace: boolean },
): Layout {
  const tokens = tokenize(text);
  let rows: Token[][] = [];

  if (options.preserveWhitespace) {
    rows = preserveWhitespace(tokens);
  } else {
    const paragraphs = splitParagraphs(tokens);
    const limit = options.wrapColumn - 1;

    for (const [index, paragraph] of paragraphs.entries()) {
      if (index > 0) {
        rows.push([]);
      }

      const wrapped = wrapParagraph(paragraph, limit);
      if (wrapped.length === 0) {
        rows.push([]);
        continue;
      }

      for (const row of wrapped) {
        rows.push(row);
      }
    }

    while (rows.at(-1)?.length === 0) {
      rows.pop();
    }
  }

  if (rows.length === 0) {
    rows.push([]);
  }

  const lines: Line[] = [];
  let width = 0;

  for (const row of rows) {
    const line = createLine(row);
    lines.push(line);
    width = Math.max(width, line.width);
  }

  return { lines, width };
}
