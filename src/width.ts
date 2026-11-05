// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
/* oxlint-disable no-control-regex -- Terminal metadata and the ASCII fast path require control ranges. */
import { emojiPresentation, wide } from "./unicode-width.ts";

export interface Token {
  readonly text: string;
  readonly width: number;
  readonly escape?: boolean;
}
interface EscapeEvent {
  offset: number;
  text: string;
}

const zeroWidthGraphemePattern = /^[\p{Mark}\p{Default_Ignorable_Code_Point}\p{Cc}]+$/v;
const emojiSequencePattern = /\p{Regional_Indicator}{2}|[\d#*]\uFE0F?\u20E3/v;
const pictographicPattern = /\p{Extended_Pictographic}/v;
const zeroWidthCharacterPattern = /[\p{Mark}\p{Default_Ignorable_Code_Point}\p{Cc}]/v;
const asciiPattern = /^[\x00-\x7f]*$/;
const terminalEscapePattern = /\x1b\[[\d;:]*m|\x1b\]8;[^\x07\x1b]*?(?:\x07|\x1b\\)/g;
let segmenter: Intl.Segmenter | undefined;

/**
 * Binary-searches a flattened table of sorted, inclusive start/end pairs.
 */
function contains(ranges: readonly number[], value: number): boolean {
  let low = 0;
  let high = ranges.length / 2 - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const start = ranges[middle * 2]!;
    const end = ranges[middle * 2 + 1]!;

    if (value < start) {
      high = middle - 1;
    } else if (value > end) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

/**
 * Measures one grapheme, accounting for emoji presentation and Unicode width tables.
 */
function graphemeWidth(text: string): number {
  if (zeroWidthGraphemePattern.test(text)) {
    return 0;
  }
  if (emojiSequencePattern.test(text)) {
    return 2;
  }
  if (text.includes("\uFE0F") && pictographicPattern.test(text)) {
    return 2;
  }

  const textPresentation = text.includes("\uFE0E");
  let width = 0;

  for (const character of text) {
    if (zeroWidthCharacterPattern.test(character)) {
      continue;
    }

    const point = character.codePointAt(0)!;
    const isWide =
      contains(wide, point) || (!textPresentation && contains(emojiPresentation, point));
    const characterWidth = isWide ? 2 : 1;
    width = Math.max(width, characterWidth);
  }
  return width;
}

/**
 * Appends measured tokens, taking the ASCII path before initializing Unicode segmentation.
 */
function plainTokens(text: string, output: Token[]): void {
  if (asciiPattern.test(text)) {
    for (const character of text) {
      output.push({ text: character, width: 1 });
    }
    return;
  }

  segmenter ??= new Intl.Segmenter("en", { granularity: "grapheme" });
  for (const { segment } of segmenter.segment(text)) {
    const width = graphemeWidth(segment);
    output.push({ text: segment, width });
  }
}

/**
 * Recognized terminal metadata is kept whole and never contributes to layout width.
 */
export function tokenize(text: string): Token[] {
  const events: EscapeEvent[] = [];
  let visible = "";
  let start = 0;

  for (const match of text.matchAll(terminalEscapePattern)) {
    visible += text.slice(start, match.index);
    events.push({ offset: visible.length, text: match[0] });
    start = match.index + match[0].length;
  }

  visible += text.slice(start);
  const plain: Token[] = [];
  plainTokens(visible, plain);

  if (events.length === 0) {
    return plain;
  }

  return restoreEscapes(plain, events);
}

/**
 * Reinserts metadata at its original offsets, keeping escapes inside graphemes in the same token.
 */
function restoreEscapes(plain: Token[], events: EscapeEvent[]): Token[] {
  const output: Token[] = [];
  let offset = 0;
  let eventIndex = 0;

  for (const token of plain) {
    while (events[eventIndex]?.offset === offset) {
      const event = events[eventIndex]!;
      output.push({ text: event.text, width: 0, escape: true });
      eventIndex++;
    }

    let decorated = "";
    let position = 0;

    while (events[eventIndex] && events[eventIndex]!.offset < offset + token.text.length) {
      const next = events[eventIndex]!;
      const inside = next.offset - offset;
      decorated += token.text.slice(position, inside) + next.text;
      position = inside;
      eventIndex++;
    }

    output.push({ text: decorated + token.text.slice(position), width: token.width });
    offset += token.text.length;
  }

  while (events[eventIndex]) {
    const event = events[eventIndex]!;
    output.push({ text: event.text, width: 0, escape: true });
    eventIndex++;
  }

  return output;
}
