// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
import { readFile } from "node:fs/promises";

import { say, think, compileCow } from "../core.ts";
import { layoutText } from "../layout.ts";
import type { Cow } from "../types.ts";
import { parseCliArgs } from "./args.ts";
import { cowPath, definedCows, discover, selectCow, resolveCow } from "./discovery.ts";
import { version } from "./version.ts";

/**
 * Formats help text without discovering cows, loading artwork, or reading stdin.
 */
function help(program: string): string {
  return `${program} version ${version}

Usage: ${program} [-bdgpstwy] [-e eyes] [-T tongue] [-f cowfile]
       [-W wrapcolumn] [-n] [-r [-C]] [--] [message ...]
       ${program} -l

  -b Borg, -d dead, -g greedy, -p paranoid, -s stoned, -t tired, -w wired, -y young
  -e eyes     Custom eyes (two Unicode code points)
  -T tongue   Custom tongue (two Unicode code points)
  -f cowfile  Cow name or existing file
  -W columns  Wrap at columns - 1 (default: 40; minimum: 2)
  -n          Preserve whitespace; stdin input only
  -r          Random discovered cow; -C includes truecolor/ cows
  -l          List cows (one per line when piped)
  -h, --help  Show help
  --version   Show version

Message arguments are joined with spaces; otherwise stdin is read through EOF.
COWPATH adds directories after installation defaults. COWSAY_ONLY_COWPATH=1
uses only COWPATH. Custom cowfiles use a safe, non-executable Perl subset.
`;
}

/**
 * Reads through EOF and removes the final record separator like Perl's chomp.
 */
async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");

  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk;
  }

  if (text.endsWith("\n")) {
    return text.slice(0, -1);
  }

  return text;
}

/**
 * Uses message arguments when present, enforcing the stdin-only whitespace mode.
 */
async function readMessage(
  message: readonly string[],
  preserveWhitespace = false,
): Promise<string> {
  if (message.length === 0) {
    return readStdin();
  }

  if (preserveWhitespace) {
    throw new Error("-n requires stdin input; message arguments are not supported");
  }

  return message.join(" ");
}

/**
 * Prints unique names when piped or directory-grouped, wrapped names on a terminal.
 */
async function printCowList(paths: readonly string[]): Promise<void> {
  if (!process.stdout.isTTY) {
    const names = await definedCows(paths);
    process.stdout.write(`${names.join("\n")}\n`);
    return;
  }

  const sections: string[] = [];
  for (const path of paths) {
    const names = await discover(path);
    if (names.length === 0) {
      continue;
    }

    const layout = layoutText(names.join(" "), {
      wrapColumn: 76,
      preserveWhitespace: false,
    });
    const lines = layout.lines.map((line) => line.text);
    const contents = lines.join("\n");

    sections.push(`Cow files in ${path}:\n${contents}\n`);
  }

  process.stdout.write(sections.join("\n"));
}

/**
 * Selects a discovered name without loading candidate artwork, optionally including truecolor cows.
 */
async function pickRandomCowFile(paths: readonly string[], includeColor: boolean): Promise<string> {
  const names = await definedCows(paths);
  const candidates = names.filter((name) => includeColor || !name.startsWith("truecolor/"));

  if (candidates.length === 0) {
    throw new Error("No cowfiles found on COWPATH");
  }

  const index = Math.floor(Math.random() * candidates.length);
  const name = candidates[index]!;
  return resolveCow(name, paths);
}

/**
 * Reads and safely compiles one selected file, rejecting executable Perl module cows.
 */
async function loadCowFile(file: string): Promise<Cow> {
  if (file.endsWith(".pm")) {
    throw new Error("Perl module (.pm) cows are not supported");
  }

  const source = await readFile(file, "utf8");
  return compileCow(source, file);
}

/**
 * Runs the speech or thought CLI and reports user-facing errors.
 */
export async function main(thought: boolean): Promise<void> {
  const program = thought ? "cowthink-ng" : "cowsay-ng";
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") {
      process.exit(0);
    }

    process.stderr.write(`${program}: ${error.message}\n`);
    process.exit(1);
  });
  try {
    const args = parseCliArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(help(program));
      return;
    }
    if (args.version) {
      process.stdout.write(`${program} ${version}\n`);
      return;
    }

    const paths = await cowPath();
    if (args.list) {
      await printCowList(paths);
      return;
    }

    const text = await readMessage(args.message, args.options.preserveWhitespace);

    let file: string;
    if (args.random) {
      file = await pickRandomCowFile(paths, args.color);
    } else {
      file = await selectCow(args.cow ?? "default.cow", paths);
    }

    const cow = await loadCowFile(file);
    const render = thought ? think : say;
    const output = render(text, { ...args.options, cow });
    process.stdout.write(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${program}: ${message}\n`);
    process.exitCode = 1;
  }
}
