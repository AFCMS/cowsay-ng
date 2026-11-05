// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
/* oxlint-disable oxc/no-barrel-file -- Deliberate public entry point. */
import { cowNames, loaders } from "./catalog.ts";
import type { CowName } from "./catalog.ts";
import { say as renderSay, think as renderThink } from "./core.ts";
import { selectFace } from "./face.ts";
import { normalizeOptions } from "./options.ts";
import type { Cow, RenderOptions } from "./types.ts";

export type { CowName } from "./catalog.ts";
export type { CoreOptions, Cow, FaceMode, RenderOptions } from "./types.ts";

export interface Options extends RenderOptions {
  cow?: CowName | Cow;
  random?: boolean;
}

/**
 * Lists the bundled cow names without loading cow modules or artwork.
 *
 * @returns The same frozen, alphabetically sorted array on every call. Names
 * omit the `.cow` suffix and can be passed to {@link loadCow}.
 *
 * @example
 * ```ts
 * const names = list();
 * ```
 */
export function list(): readonly CowName[] {
  return cowNames;
}

/**
 * Lazily loads a bundled cow and returns its compiled template.
 *
 * Native module caching shares the immutable template across subsequent and
 * concurrent loads of the same name. Name-based loading makes the complete
 * catalog reachable to bundlers as lazy assets.
 *
 * @param name - Case-sensitive bundled name without the `.cow` suffix.
 * @returns A promise resolving to a reusable, immutable compiled cow.
 * @throws {TypeError} The promise rejects if the name is not a string or is not bundled.
 * @throws {Error} The promise rejects if the cow module or its text asset cannot be loaded.
 *
 * @example
 * ```ts
 * const cow = await loadCow("sheep");
 * const output = await say("Hello!", { cow });
 * ```
 */
export async function loadCow(name: string): Promise<Cow> {
  if (typeof name !== "string" || !Object.hasOwn(loaders, name)) {
    throw new TypeError(`Unknown cow name: ${String(name)}`);
  }

  const module = await loaders[name as CowName]();
  return module.default;
}

/**
 * Validates cow selection, loads one template when necessary, and delegates to the core.
 */
async function render(text: string, options: Options, thought: boolean): Promise<string> {
  normalizeOptions(text, options);
  selectFace(options);
  if (options.random !== undefined && typeof options.random !== "boolean") {
    throw new TypeError("random must be a boolean");
  }
  if (options.cow !== undefined && options.random !== undefined) {
    throw new TypeError("cow and random cannot be specified together");
  }

  let choice: CowName | Cow = "default";
  if (options.random) {
    const index = Math.floor(Math.random() * cowNames.length);
    choice = cowNames[index]!;
  } else if (options.cow !== undefined) {
    choice = options.cow;
  }

  const cow = typeof choice === "string" ? await loadCow(choice) : choice;
  const renderMessage = thought ? renderThink : renderSay;
  return renderMessage(text, { ...options, cow });
}

/**
 * Renders a speech balloon, lazily loading the selected cow when needed.
 *
 * Omitting `cow` and `random` selects the default cow. Supplying both is an
 * error, even when `random` is false. A compiled cow requires no loading or
 * parsing; a bundled name is loaded through {@link loadCow}.
 *
 * @param text - Message to render; an empty string is valid.
 * @param options - Optional face, layout, and cow selection settings.
 * @returns A promise resolving to the balloon and artwork, including their trailing newlines.
 * @throws {TypeError} The promise rejects for invalid text or options, an unknown
 * cow name, an uncompiled cow, or conflicting cow selection options.
 * @throws {RangeError} The promise rejects if `wrapColumn` is not a safe integer of at least two.
 *
 * @example
 * ```ts
 * const output = await say("Hello!", { cow: "sheep", mode: "young" });
 * ```
 */
export async function say(text: string, options: Options = {}): Promise<string> {
  return render(text, options, false);
}

/**
 * Renders a thought balloon, lazily loading the selected cow when needed.
 *
 * Omitting `cow` and `random` selects the default cow. Supplying both is an
 * error, even when `random` is false. A compiled cow requires no loading or
 * parsing; a bundled name is loaded through {@link loadCow}.
 *
 * @param text - Message to render; an empty string is valid.
 * @param options - Optional face, layout, and cow selection settings.
 * @returns A promise resolving to the balloon and artwork, including their trailing newlines.
 * @throws {TypeError} The promise rejects for invalid text or options, an unknown
 * cow name, an uncompiled cow, or conflicting cow selection options.
 * @throws {RangeError} The promise rejects if `wrapColumn` is not a safe integer of at least two.
 *
 * @example
 * ```ts
 * const output = await think("Hmm…", { random: true });
 * ```
 */
export async function think(text: string, options: Options = {}): Promise<string> {
  return render(text, options, true);
}
