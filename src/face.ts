// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
import type { FaceMode, RenderOptions } from "./types.ts";

const modes: Readonly<Record<FaceMode, readonly [string, string?]>> = Object.freeze({
  borg: ["=="],
  dead: ["xx", "U "],
  greedy: ["$$"],
  paranoid: ["@@"],
  stoned: ["**", "U "],
  tired: ["--"],
  wired: ["OO"],
  young: [".."],
});

/**
 * Returns the default face feature or truncates an explicit string to two Unicode code points.
 */
function pair(value: string | undefined, fallback: string, name: string): string {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }

  return Array.from(value).slice(0, 2).join("");
}

/**
 * Applies a mood's eye and optional tongue overrides after validating custom features.
 */
export function selectFace(options: RenderOptions) {
  let eyes = pair(options.eyes, "oo", "eyes");
  let tongue = pair(options.tongue, "  ", "tongue");
  if (options.mode !== undefined) {
    if (!Object.hasOwn(modes, options.mode)) {
      throw new TypeError(`Unknown face mode: ${String(options.mode)}`);
    }

    const face = modes[options.mode];
    eyes = face[0];
    tongue = face[1] ?? tongue;
  }

  return { eyes, tongue };
}
