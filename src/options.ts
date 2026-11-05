// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
import type { RenderOptions } from "./types.ts";

/**
 * Validates text and layout settings, then supplies the default wrapping behavior.
 */
export function normalizeOptions(text: string, options: RenderOptions) {
  if (typeof text !== "string") {
    throw new TypeError("text must be a string");
  }
  if (options === null || typeof options !== "object") {
    throw new TypeError("options must be an object");
  }

  const { wrapColumn = 40, preserveWhitespace = false } = options;

  if (!Number.isSafeInteger(wrapColumn) || wrapColumn < 2) {
    throw new RangeError("wrapColumn must be an integer of at least 2");
  }
  if (typeof preserveWhitespace !== "boolean") {
    throw new TypeError("preserveWhitespace must be a boolean");
  }

  return { wrapColumn, preserveWhitespace };
}
