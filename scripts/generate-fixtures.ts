// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
// Development-only reference runner. Ordinary tests consume checked-in JSON and need no Perl.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { cac } from "cac";

import snapshot from "./cows-snapshot.json" with { type: "json" };

interface FixtureCase {
  label: string;
  text: string;
  args: string[];
  thought: boolean;
  output?: string;
}

const referenceUrl = `https://raw.githubusercontent.com/${snapshot.repository}/${snapshot.commit}/bin/cowsay`;
const referenceHash = "52f63bf35bea88acf90465e44d50157d9fb67421401437778eac0dcdf50a7005";

/**
 * Reads or downloads the reference implementation and enforces its pinned source checksum.
 */
async function loadReference(path?: string): Promise<Buffer> {
  let data: Buffer;

  if (path) {
    data = await readFile(path);
  } else {
    const response = await fetch(referenceUrl);
    data = Buffer.from(await response.arrayBuffer());
  }

  const actualHash = createHash("sha256").update(data).digest("hex");
  if (actualHash !== referenceHash) {
    throw new Error("Reference source checksum mismatch");
  }

  return data;
}

/**
 * Builds the deterministic artwork, face, wrapping, and paragraph comparison cases.
 */
function createCases(): FixtureCase[] {
  const cases: FixtureCase[] = [];

  /**
   * Appends one comparison case, leaving output to the reference runner.
   */
  function add(label: string, text: string, args: string[] = [], thought = false): void {
    cases.push({ label, text, args, thought });
  }

  const names = Object.keys(snapshot.files)
    .filter((name) => name.endsWith(".cow"))
    .map((name) => name.split("/").at(-1)!.slice(0, -4))
    .toSorted();

  for (const name of names) {
    add(`cow ${name}`, "Hello world!", ["-f", name]);
    add(`face ${name}`, "Hello world!", ["-f", name, "-e", "^!", "-T", "V "]);
    add(`think ${name}`, "Hello world!", ["-f", name], true);
  }

  const wrappingSamples = [
    "",
    "\n",
    "\n\n",
    " ",
    "  leading  and trailing  ",
    "a\nb",
    "a\n\nb",
    "a\n b",
    "a\n  \n b",
    "\na",
    "a\n",
    "a\n\n",
    "a\r\nb",
    "a\tb\tend",
    "1234567 12345678 123456789",
    "abcdefghijk",
    "one two three four five",
    "a\f b",
    "a\n\tindented",
  ];

  for (const text of wrappingSamples) {
    for (const width of [2, 3, 8, 9, 10, 40]) {
      add(`wrap ${width} ${JSON.stringify(text)}`, text, ["-W", String(width)]);
    }

    add(`preserve ${JSON.stringify(text)}`, text, ["-n"]);
  }

  const paragraphSamples = [
    "\n b",
    "\n\n b",
    "\n \na",
    "a\n ",
    "a\n  \nb",
    " a ",
    "\t",
    " \t \n b",
  ];
  for (const text of paragraphSamples) {
    for (const width of [2, 3, 8, 40]) {
      add(`paragraph ${width} ${JSON.stringify(text)}`, text, ["-W", String(width)]);
    }
  }

  for (const flag of ["b", "d", "g", "p", "s", "t", "w", "y", "bdgpstwy", "yd", "gd"]) {
    add(`mood ${flag}`, "Mood", [`-${flag}`, "-e", "^!", "-T", "V "]);
  }

  for (const name of ["small", "sus", "three-eyes", "udder"]) {
    for (const eyes of ["", "0", "x", "abc"]) {
      add(`prelude ${name} ${eyes}`, "Face", ["-f", name, "-e", eyes]);
    }
  }

  return cases;
}

/**
 * Runs the development-only Perl reference and records each expected output.
 */
function executeCases(cases: FixtureCase[], say: string, think: string): void {
  const environment = {
    ...process.env,
    COWPATH: resolve("src/cows"),
    COWSAY_ONLY_COWPATH: "1",
  };

  for (const test of cases) {
    const executable = test.thought ? think : say;
    const result = spawnSync("perl", [executable, ...test.args], {
      timeout: 5000,
      input: test.text,
      encoding: "utf8",
      env: environment,
    });

    if (result.status !== 0 || result.error) {
      const reason = result.stderr || result.error;
      throw new Error(`Reference failed for ${test.label}: ${reason}`);
    }

    test.output = result.stdout;
  }
}

/**
 * Regenerates reference fixtures with source provenance and removes temporary executables.
 */
async function generateFixtures(reference?: string): Promise<void> {
  const data = await loadReference(reference);
  const directory = await mkdtemp(join(tmpdir(), "cowsay-reference-"));

  try {
    const say = join(directory, "cowsay");
    const think = join(directory, "cowthink");
    await writeFile(say, data);
    await writeFile(think, data);

    const cases = createCases();
    executeCases(cases, say, think);

    const versionResult = spawnSync("perl", ["-MText::Wrap", "-e", "print $Text::Wrap::VERSION"], {
      encoding: "utf8",
    });
    const fixture = {
      source: referenceUrl,
      sha256: referenceHash,
      textWrap: versionResult.stdout,
      cases,
    };
    const output = JSON.stringify(fixture, null, 2) + "\n";

    await mkdir("tests/fixtures", { recursive: true });
    await writeFile("tests/fixtures/perl.json", output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const cli = cac("generate-fixtures");
cli
  .command(
    "[reference]",
    "Generate compatibility fixtures from a local pinned Perl source, or download it when omitted.",
  )
  .action(generateFixtures);
cli.help();

try {
  cli.parse(process.argv, { run: false });
  await cli.runMatchedCommand();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
