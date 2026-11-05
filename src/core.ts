// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
/* oxlint-disable oxc/no-barrel-file -- Deliberate public entry point. */
import { constructBalloon } from "./balloon.ts";
import { renderCow } from "./compiler.ts";
import { selectFace } from "./face.ts";
import { layoutText } from "./layout.ts";
import { normalizeOptions } from "./options.ts";
import type { CoreOptions } from "./types.ts";

export { compileCow } from "./compiler.ts";
export type { CoreOptions, Cow, FaceMode, RenderOptions } from "./types.ts";

/**
 * Validates a synchronous render and combines its balloon with the compiled artwork.
 */
function render(text: string, options: CoreOptions, thought: boolean): string {
  const normalized = normalizeOptions(text, options);
  const face = selectFace(options);
  const thoughts = thought ? "o" : "\\";
  const artwork = renderCow(options.cow, face, thoughts);
  const layout = layoutText(text, normalized);
  const balloon = constructBalloon(layout, thought);

  return balloon + artwork;
}

/**
 * Synchronously renders a speech balloon and an already compiled cow.
 *
 * Performs no artwork loading or template parsing.
 *
 * @param text - Message to render; an empty string is valid.
 * @param options - Required compiled cow and optional face and layout settings.
 * @returns The rendered balloon and artwork, including their trailing newlines.
 * @throws {TypeError} If the text, options, or compiled cow is invalid.
 * @throws {RangeError} If `wrapColumn` is not a safe integer of at least two.
 *
 * @example
 * ```ts
 * import { say } from "@afcms/cowsay-ng/core";
 * import cow from "@afcms/cowsay-ng/cows/default";
 *
 * const output = say("Hello!", { cow, mode: "young" });
 * ```
 */
export function say(text: string, options: CoreOptions): string {
  return render(text, options, false);
}

/**
 * Synchronously renders a thought balloon and an already compiled cow.
 *
 * Performs no artwork loading or template parsing.
 *
 * @param text - Message to render; an empty string is valid.
 * @param options - Required compiled cow and optional face and layout settings.
 * @returns The rendered balloon and artwork, including their trailing newlines.
 * @throws {TypeError} If the text, options, or compiled cow is invalid.
 * @throws {RangeError} If `wrapColumn` is not a safe integer of at least two.
 *
 * @example
 * ```ts
 * import { think } from "@afcms/cowsay-ng/core";
 * import cow from "@afcms/cowsay-ng/cows/sheep";
 *
 * const output = think("Hmm…", { cow });
 * ```
 */
export function think(text: string, options: CoreOptions): string {
  return render(text, options, true);
}
