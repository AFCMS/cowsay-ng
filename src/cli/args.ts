// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
import { cac } from "cac";

import { selectFace } from "../face.ts";
import type { FaceMode, RenderOptions } from "../types.ts";

const valueFlags = new Set(["e", "T", "f", "W"]);
const booleanFlags = new Set(["b", "d", "g", "p", "s", "t", "w", "y", "n", "l", "r", "C", "h"]);
const wrapColumnPattern = /^\d+$/;
const faceFlags: readonly [string, FaceMode][] = [
  ["b", "borg"],
  ["d", "dead"],
  ["g", "greedy"],
  ["p", "paranoid"],
  ["s", "stoned"],
  ["t", "tired"],
  ["w", "wired"],
  ["y", "young"],
];
const parser = cac("cowsay-ng");
for (const flag of [...booleanFlags, "help", "version"]) {
  parser.option(`--${flag}`, "");
}
for (const flag of valueFlags) {
  parser.option(`--${flag} <value>`, "");
}

/**
 * Keeps the last repeated value and removes the prefix that protects strings from cac coercion.
 */
function stringOption(value: string | string[] | undefined): string | undefined {
  const lastValue = Array.isArray(value) ? value.at(-1) : value;
  return lastValue?.slice(1);
}

/**
 * Expands grouped short flags and attached values, stopping at Getopt::Std's first operand.
 */
function adaptArguments(args: string[]) {
  const adapted: string[] = [];
  let operand = args.length;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") {
      operand = i + 1;
      break;
    }
    if (arg === "-" || !arg.startsWith("-")) {
      operand = i;
      break;
    }
    if (arg.startsWith("--")) {
      if (arg !== "--help" && arg !== "--version") {
        throw new Error(`Unknown option: ${arg}`);
      }

      adapted.push(arg);
      continue;
    }
    for (let j = 1; j < arg.length; j++) {
      const flag = arg[j]!;
      if (valueFlags.has(flag)) {
        const value = arg.slice(j + 1) || args[++i];
        if (value === undefined) {
          throw new Error(`Option -${flag} requires a value`);
        }

        // A nonnumeric prefix also protects empty and dash-prefixed values from cac's coercion.
        adapted.push(`--${flag}=:${value}`);
        break;
      }
      if (!booleanFlags.has(flag)) {
        throw new Error(`Unknown option: -${flag}`);
      }

      adapted.push(`--${flag}`);
    }
  }

  return { adapted, operand };
}

/**
 * Validates Perl's wrapping column before converting it to a number.
 */
function parseWrapColumn(value: string): number {
  if (!wrapColumnPattern.test(value)) {
    throw new Error("-W must be an integer of at least 2");
  }

  const column = Number(value);
  if (!Number.isSafeInteger(column) || column < 2) {
    throw new Error("-W must be an integer of at least 2");
  }

  return column;
}

/**
 * Parses adapted Perl options with cac, retaining literal message arguments and fixed mood precedence.
 */
export function parseCliArgs(args: string[]) {
  const { adapted, operand } = adaptArguments(args);
  const { options: values } = parser.parse(["node", "cowsay-ng", ...adapted], { run: false });
  const eyes = stringOption(values.e);
  const tongue = stringOption(values.T);
  const cow = stringOption(values.f);
  const wrapColumn = stringOption(values.W);
  const options: RenderOptions = { preserveWhitespace: !!values.n };

  if (eyes !== undefined) {
    options.eyes = eyes;
  }
  if (tongue !== undefined) {
    options.tongue = tongue;
  }
  if (wrapColumn !== undefined) {
    options.wrapColumn = parseWrapColumn(wrapColumn);
  }

  // Apply each override, including tongue changes, in the reference's fixed order.
  for (const [flag, mode] of faceFlags) {
    if (values[flag]) {
      const face = selectFace({ ...options, mode });
      Object.assign(options, face);
    }
  }

  return {
    options,
    message: args.slice(operand),
    cow,
    random: !!values.r,
    color: !!values.C,
    list: !!values.l,
    help: !!(values.h || values.help),
    version: !!values.version,
  };
}
