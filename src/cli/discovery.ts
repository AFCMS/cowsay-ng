// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
import { readdir, readFile, stat } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const installationPrefix = fileURLToPath(new URL("../", import.meta.url));

/**
 * Checks file existence while allowing real filesystem failures to reach the CLI error handler.
 */
async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return false;
    }

    throw error;
  }
}

/**
 * Builds the ordered prefix, configuration, and environment search path without scanning artwork.
 */
export async function cowPath(
  prefix = installationPrefix,
  environment = process.env,
): Promise<string[]> {
  const defaults = [join(prefix, "share/cowsay/site-cows"), join(prefix, "share/cowsay/cows")];
  const etc = resolve(prefix) === "/usr" ? "/etc" : join(prefix, "etc");
  const config = join(etc, "cowsay/cowpath.d");
  try {
    for (const entry of (await readdir(config)).toSorted()) {
      const file = join(config, entry);
      if (!entry.endsWith(".path") || !(await isFile(file))) {
        continue;
      }

      const text = await readFile(file, "utf8");
      const lines = text.split("\n");
      if (lines.at(-1) === "") {
        lines.pop();
      }

      defaults.push(...lines);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const user = environment.COWPATH ? environment.COWPATH.split(delimiter).filter(Boolean) : [];
  const onlyUserPaths = environment.COWPATH && Number(environment.COWSAY_ONLY_COWPATH) === 1;
  const paths = onlyUserPaths ? user : [...defaults, ...user];

  return [...new Set(paths)];
}

/**
 * Recursively discovers relative cow names without reading or compiling cow files.
 */
export async function discover(directory: string): Promise<string[]> {
  const names: string[] = [];

  /**
   * Visits actual subdirectories and includes symlinks to files without following directory links.
   */
  async function visit(folder: string, relative: string) {
    let entries;
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        return;
      }

      throw error;
    }
    for (const entry of entries) {
      const name = relative + entry.name;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        await visit(path, `${name}/`);
        continue;
      }
      if (!name.endsWith(".cow")) {
        continue;
      }

      const isCowFile = entry.isFile() || (entry.isSymbolicLink() && (await isFile(path)));
      if (isCowFile) {
        names.push(name.slice(0, -4));
      }
    }
  }
  await visit(directory, "");
  return names.toSorted();
}

/**
 * Collects unique, sorted names from all search directories without loading templates.
 */
export async function definedCows(paths: readonly string[]): Promise<string[]> {
  const found = await Promise.all(paths.map((path) => discover(path)));
  return [...new Set(found.flat())].toSorted();
}

/**
 * Searches directories in order, trying the exact name before adding the cow extension.
 */
export async function resolveCow(name: string, paths: readonly string[]): Promise<string> {
  for (const directory of paths) {
    for (const candidate of [join(directory, name), join(directory, `${name}.cow`)]) {
      if (await isFile(candidate)) {
        return candidate;
      }
    }
  }
  throw new Error(`Could not find cowfile for '${name}'`);
}

/**
 * Honors an existing file in the current context before looking up a cow name.
 */
export async function selectCow(name: string, paths: readonly string[]): Promise<string> {
  if (await isFile(name)) {
    return name;
  }

  return resolveCow(name, paths);
}
