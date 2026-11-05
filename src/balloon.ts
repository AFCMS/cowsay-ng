// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
/* oxlint-disable no-control-regex -- SGR and OSC 8 contain literal terminal controls. */
import type { Layout } from "./layout.ts";

const terminalEscapePattern = /\x1b\[[\d;:]*m|\x1b\]8;[^\x07\x1b]*?(?:\x07|\x1b\\)/g;
const sgrResetPattern = /^\x1b\[(?:0)?m$/;
const oscTerminatorPattern = /(?:\x07|\x1b\\)$/;
const thoughtBorders = ["(", ")"] as const;
const singleLineBorders = ["<", ">"] as const;
const firstLineBorders = ["/", "\\"] as const;
const lastLineBorders = ["\\", "/"] as const;
const middleLineBorders = ["|", "|"] as const;

/**
 * Chooses the border pair for a thought balloon or a speech row's position.
 */
function selectBorders(
  thought: boolean,
  index: number,
  lineCount: number,
): readonly [string, string] {
  if (thought) {
    return thoughtBorders;
  }
  if (lineCount === 1) {
    return singleLineBorders;
  }
  if (index === 0) {
    return firstLineBorders;
  }
  if (index === lineCount - 1) {
    return lastLineBorders;
  }

  return middleLineBorders;
}

/**
 * Styling is restored inside each row and closed before its padding and borders.
 */
export function constructBalloon(layout: Layout, thought: boolean): string {
  const borderWidth = layout.width + 2;
  const lines = [` ${"_".repeat(borderWidth)}\n`];
  let activeSgr = "";
  let activeHyperlink = "";

  for (const [index, line] of layout.lines.entries()) {
    const restore = activeSgr + activeHyperlink;

    for (const match of line.text.matchAll(terminalEscapePattern)) {
      const sequence = match[0];
      if (sequence.startsWith("\x1b[")) {
        if (sgrResetPattern.test(sequence)) {
          activeSgr = "";
        } else {
          activeSgr += sequence;
        }
      } else {
        const content = sequence.slice(4).replace(oscTerminatorPattern, "");
        const url = content.slice(content.indexOf(";") + 1);
        activeHyperlink = url ? sequence : "";
      }
    }

    let close = "";
    if (activeHyperlink) {
      close += "\x1b]8;;\x1b\\";
    }
    if (activeSgr) {
      close += "\x1b[0m";
    }

    const [left, right] = selectBorders(thought, index, layout.lines.length);
    const padding = " ".repeat(layout.width - line.width);
    const contents = restore + line.text + close;
    lines.push(`${left} ${contents}${padding} ${right}\n`);
  }

  lines.push(` ${"-".repeat(borderWidth)}\n`);
  return lines.join("");
}
