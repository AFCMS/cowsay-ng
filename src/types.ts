// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
declare const cowBrand: unique symbol;

/**
 * An immutable compiled template. Create with compileCow or import a bundled cow.
 */
export interface Cow {
  readonly [cowBrand]: true;
}

export type FaceMode =
  | "borg"
  | "dead"
  | "greedy"
  | "paranoid"
  | "stoned"
  | "tired"
  | "wired"
  | "young";

export interface RenderOptions {
  eyes?: string;
  tongue?: string;
  mode?: FaceMode;
  /**
   * Perl's -W convention: wrap at wrapColumn - 1, retaining its whitespace boundary behavior.
   */
  wrapColumn?: number;
  /**
   * Preserve lines and spaces, expand tabs at eight-column stops, and disable wrapping.
   */
  preserveWhitespace?: boolean;
}

export interface CoreOptions extends RenderOptions {
  cow: Cow;
}
