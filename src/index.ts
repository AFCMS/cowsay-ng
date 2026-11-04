// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT

import { defaultCow } from "./cows.ts";

export interface CowOptions {
  cow: string;
}

export function say(options: CowOptions): string {
  return "hello world" + options.cow + defaultCow;
}
