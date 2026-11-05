// SPDX-FileCopyrightText: 2026 AFCMS <afcm.contact@gmail.com>
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Rolldown } from "tsdown";

import metadata from "../package.json" with { type: "json" };
import fixture from "../tests/fixtures/perl.json" with { type: "json" };

interface CommandOptions {
  cwd?: string;
  input?: string;
  openStdin?: boolean;
  environment?: NodeJS.ProcessEnv;
  brokenPipe?: boolean;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "cowsay-package-"));
const environment = {
  ...process.env,
  NODE_OPTIONS: "",
  npm_config_update_notifier: "false",
  HUSKY: "0",
  XDG_STATE_HOME: join(temporary, "state"),
  XDG_CACHE_HOME: join(temporary, "cache"),
  XDG_DATA_HOME: join(temporary, "data"),
};
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const nodeImportPattern = /(?:from|import)\s*["']node:/;
const textAttributePattern = /with\s*\{\s*type:\s*"text"/;

/**
 * Runs a bounded child process, optionally keeping stdin open or simulating a broken output pipe.
 */
function run(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.environment ?? environment,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out: ${command} ${args.join(" ")}`));
    }, 20_000);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      if (options.brokenPipe) {
        child.stdout.destroy();
      }
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") {
        reject(error);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      accept({ code, stdout, stderr });
    });

    if (!options.openStdin) {
      child.stdin.end(options.input ?? "");
    }
  });
}

/**
 * Requires a successful child exit and includes captured output in assertion failures.
 */
async function successful(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  const result = await run(command, args, options);
  const failure = `${command} failed:\n${result.stderr}\n${result.stdout}`;
  assert.equal(result.code, 0, failure);
  return result;
}

/**
 * Packs and installs into a temporary consumer using the existing local dependency, entirely offline.
 */
async function installConsumer(): Promise<string> {
  await successful(packageManager, ["pack", "--out", join(temporary, "package.tgz")]);
  const tarball = (await readdir(temporary)).find((name) => name.endsWith(".tgz"));
  assert(tarball, "Package tarball missing");

  const consumer = join(temporary, "consumer");
  await mkdir(consumer);

  const cac = await realpath(join(root, "node_modules/cac"));
  const manifest = {
    private: true,
    type: "module",
    dependencies: { [metadata.name]: `file:${join(temporary, tarball)}` },
  };
  const workspace = `overrides:
  cac: ${JSON.stringify(`file:${cac}`)}
`;

  await writeFile(join(consumer, "package.json"), JSON.stringify(manifest));
  await writeFile(join(consumer, "pnpm-workspace.yaml"), workspace);

  await successful(
    packageManager,
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--store-dir",
      join(temporary, "store"),
      "--config.manage-package-manager-versions=false",
    ],
    { cwd: consumer },
  );

  return consumer;
}

/**
 * Executes a consumer module with native experimental text imports enabled.
 */
async function runApi(consumer: string, source: string): Promise<CommandResult> {
  const args = ["--experimental-import-text", "--input-type=module", "-e", source];
  return successful(process.execPath, args, { cwd: consumer });
}

/**
 * Verifies native lazy loading, module caching, raw sources, and the isolated core import boundary.
 */
async function verifyNativeImports(consumer: string): Promise<void> {
  await runApi(
    consumer,
    `
    import assert from "node:assert/strict";
    import { registerHooks } from "node:module";

    let artwork = 0;
    registerHooks({
      load(url, context, next) {
        if (url.endsWith(".cow")) {
          artwork++;
        }
        return next(url, context);
      },
    });

    const { say, think, list, loadCow } = await import("${metadata.name}");
    assert.equal(artwork, 0);
    assert.equal(list().length, 54);
    assert(Object.isFrozen(list()));
    assert.equal(artwork, 0);

    const [first, second] = await Promise.all([loadCow("default"), loadCow("default")]);
    assert.equal(first, second);
    assert.equal(artwork, 1);
    assert((await say("hi", { cow: first })).includes("< hi >"));
    assert((await think("hi")).includes("( hi )"));
    assert.equal(artwork, 1);

    const explicit = (await import("${metadata.name}/cows/default")).default;
    assert.equal(explicit, first);

    const { default: raw } = await import("${metadata.name}/cows/default.cow", {
      with: { type: "text" },
    });
    assert.equal(typeof raw, "string");

    await Promise.all(list().map(loadCow));
    assert.equal(artwork, 54);
  `,
  );

  await runApi(
    consumer,
    `
    import assert from "node:assert/strict";
    import { registerHooks } from "node:module";

    const loaded = [];
    registerHooks({
      load(url, context, next) {
        loaded.push(url);
        return next(url, context);
      },
    });

    const { say } = await import("${metadata.name}/core");
    const { default: cow } = await import("${metadata.name}/cows/sheep");

    assert(say("hi", { cow }).includes("< hi >"));
    assert.equal(loaded.filter((url) => url.endsWith(".cow")).length, 1);
    assert(!loaded.some((url) => url.endsWith("/catalog.mjs") || url.includes("/cli/")));
  `,
  );
}

/**
 * Tests both real pnpm-generated command shims, their shebangs, and their early-exit options.
 */
async function verifyShims(consumer: string, installedDist: string): Promise<void> {
  for (const name of ["cowsay", "cowthink"]) {
    const entry = join(installedDist, "bin", `${name}.mjs`);
    const source = await readFile(entry, "utf8");
    assert(source.startsWith("#!/usr/bin/env -S node --experimental-import-text\n"));

    const extension = process.platform === "win32" ? ".cmd" : "";
    const shim = join(consumer, "node_modules/.bin", `${name}-ng${extension}`);
    const result = await successful(shim, ["hello"], { cwd: consumer, openStdin: true });
    const expectedBalloon = name === "cowthink" ? "( hello )" : "< hello >";
    assert(result.stdout.includes(expectedBalloon));

    for (const option of ["--help", "--version", "-l"]) {
      await successful(shim, [option], { cwd: consumer, openStdin: true });
    }
  }
}

/**
 * Ensures help and version perform no input/discovery work, and exercises terminal-style listing.
 */
async function verifyEarlyExit(executable: string): Promise<void> {
  const guard = join(temporary, "help-guard.mjs");
  await writeFile(
    guard,
    `
    import fs from "node:fs/promises";
    import { registerHooks, syncBuiltinESMExports } from "node:module";

    fs.readdir = () => {
      throw Error("unexpected directory scan");
    };
    syncBuiltinESMExports();

    process.stdin[Symbol.asyncIterator] = () => {
      throw Error("unexpected stdin read");
    };

    registerHooks({
      load(url, context, next) {
        if (url.endsWith(".cow")) {
          throw Error("unexpected artwork load");
        }
        return next(url, context);
      },
    });
  `,
  );

  for (const option of ["--help", "--version"]) {
    await successful(process.execPath, ["--import", guard, executable, option], {
      openStdin: true,
    });
  }

  const pretty = join(temporary, "pretty-list.mjs");
  await writeFile(pretty, 'Object.defineProperty(process.stdout, "isTTY", { value: true });\n');
  const listing = await successful(process.execPath, ["--import", pretty, executable, "-l"], {
    openStdin: true,
  });
  assert(listing.stdout.includes("Cow files in "));
  assert(listing.stdout.includes("default"));
}

/**
 * Compares installed CLI output to every reference fixture and checks literal message operands.
 */
async function verifyCliOutput(installedDist: string): Promise<void> {
  for (const test of fixture.cases) {
    const name = test.thought ? "cowthink.mjs" : "cowsay.mjs";
    const entry = join(installedDist, "bin", name);
    const result = await successful(process.execPath, [entry, ...test.args], {
      input: test.text,
    });
    assert.equal(result.stdout, test.output, test.label);
  }

  const executable = join(installedDist, "bin/cowsay.mjs");
  const afterSeparator = await successful(process.execPath, [executable, "--", "-n", "literal"], {
    openStdin: true,
  });
  assert(afterSeparator.stdout.includes("< -n literal >"));

  const zero = await successful(process.execPath, [executable, "0"], { openStdin: true });
  assert(zero.stdout.includes("< 0 >"));

  const operands = await successful(process.execPath, [executable, "args", "-n"], {
    input: "ignored",
  });
  assert(operands.stdout.includes("< args -n >"));
}

/**
 * Checks concise errors, discovery without compilation, random/color filtering, and broken pipes.
 */
async function verifyCliErrorsAndSelection(executable: string): Promise<void> {
  for (const args of [["-n", "message"], ["-W1"], ["-fmissing"], ["--unknown"]]) {
    const result = await run(process.execPath, [executable, ...args]);
    assert.equal(result.code, 1);
    assert(!result.stderr.includes("\n    at "));
    assert(result.stderr.startsWith("cowsay-ng:"));
  }

  const directory = join(temporary, "empty");
  await mkdir(directory);
  const externalEnvironment = {
    ...environment,
    COWPATH: directory,
    COWSAY_ONLY_COWPATH: "1",
  };
  const badCow = join(directory, "bad.cow");
  await writeFile(badCow, 'system("id");\n');

  const listing = await successful(process.execPath, [executable, "-l"], {
    environment: externalEnvironment,
  });
  assert.equal(listing.stdout, "bad\n");

  const invalidCow = await run(process.execPath, [executable, "-fbad"], {
    environment: externalEnvironment,
  });
  assert.equal(invalidCow.code, 1);

  await mkdir(join(directory, "truecolor"));
  await writeFile(
    join(directory, "good.cow"),
    `$the_cow = <<EOC;
basic
EOC
`,
  );
  await writeFile(
    join(directory, "truecolor/color.cow"),
    `$the_cow = <<EOC;
color
EOC
`,
  );
  await rm(badCow);

  const seeded = join(temporary, "seed.mjs");
  await writeFile(seeded, "Math.random = () => 0.999999;\n");

  const basic = await successful(process.execPath, ["--import", seeded, executable, "-r", "hi"], {
    environment: externalEnvironment,
  });
  assert(basic.stdout.endsWith("basic\n"));

  const color = await successful(process.execPath, ["--import", seeded, executable, "-rC", "hi"], {
    environment: externalEnvironment,
  });
  assert(color.stdout.endsWith("color\n"));

  const brokenPipe = await successful(process.execPath, [executable, "-n"], {
    input: "x".repeat(500_000),
    brokenPipe: true,
  });
  assert.equal(brokenPipe.code, 0);
}

/**
 * Type-checks installed public exports without access to source-tree ambient declarations.
 */
async function verifyConsumerTypes(consumer: string): Promise<void> {
  const entry = join(consumer, "consumer.ts");
  await writeFile(
    entry,
    `
    import { say, loadCow, list, type CowName } from "${metadata.name}";
    import { say as sync, compileCow } from "${metadata.name}/core";
    import cow from "${metadata.name}/cows/default";
    import raw from "${metadata.name}/cows/default.cow" with { type: "text" };

    const name: CowName = list()[0]!;
    const result: Promise<string> = say("hi", { cow: name });
    const text: string = sync("hi", { cow: compileCow(raw) });
    void [result, text, loadCow(name), cow];

    // @ts-expect-error core requires a compiled cow
    sync("hi", { cow: "default" });
    // @ts-expect-error text must be a string
    say(123);
    // @ts-expect-error invalid bundled name
    const invalid: CowName = "missing";
    void invalid;
  `,
  );

  await successful(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "--ignoreConfig",
      "--noEmit",
      "--strict",
      "--module",
      "nodenext",
      "--target",
      "esnext",
      entry,
    ],
    { cwd: consumer },
  );
}

/**
 * Builds each browser loading strategy and verifies its reachable artwork and module boundaries.
 */
async function verifyBrowserBundles(consumer: string): Promise<void> {
  const strategies = {
    explicit: {
      cowCount: 1,
      source: `
        import { say } from "${metadata.name}/core";
        import cow from "${metadata.name}/cows/sheep";

        console.log(say("hi", { cow }));
      `,
    },
    named: {
      cowCount: 54,
      source: `
        import { say } from "${metadata.name}";

        console.log(await say("hi"));
      `,
    },
    list: {
      cowCount: 0,
      source: `
        import { list } from "${metadata.name}";

        console.log(list());
      `,
    },
  };

  for (const [strategy, settings] of Object.entries(strategies)) {
    const entry = join(consumer, `${strategy}.mjs`);
    await writeFile(entry, settings.source);

    const bundle = await Rolldown.rolldown({
      input: entry,
      platform: "browser",
      plugins: [
        {
          name: "text-modules",
          /**
           * Adapts native text assets to JavaScript for the browser consumer build.
           */
          async load(id) {
            if (!id.endsWith(".cow")) {
              return;
            }

            const source = await readFile(id, "utf8");
            return `export default ${JSON.stringify(source)}`;
          },
        },
      ],
    });

    try {
      const { output } = await bundle.generate({
        format: "esm",
        dir: join(temporary, strategy),
      });
      const chunks = output.filter((part) => part.type === "chunk");
      const modules = chunks.flatMap((part) => Object.keys(part.modules));
      const cowModules = modules.filter((id) => id.endsWith(".cow"));

      assert(!chunks.some((part) => nodeImportPattern.test(part.code)));
      assert.equal(cowModules.length, settings.cowCount);

      if (strategy === "explicit") {
        assert(!modules.some((id) => id.endsWith("/catalog.mjs")));
      }
      if (strategy === "named") {
        const lazyChunks = chunks.filter((part) => part.isDynamicEntry);
        assert.equal(lazyChunks.length, 54);
      }
    } finally {
      await bundle.close();
    }
  }
}

/**
 * Confirms emitted cow modules retain text attributes and use the shared compiler.
 */
async function verifyEmittedCows(installedDist: string): Promise<void> {
  const directory = join(installedDist, "cows");
  const modules = (await readdir(directory)).filter((name) => name.endsWith(".mjs"));

  for (const name of modules) {
    const source = await readFile(join(directory, name), "utf8");
    const hasTextImport = source.includes('with{type:"text"}') || textAttributePattern.test(source);
    assert(hasTextImport);
    assert(source.includes("../compiler.mjs"));
  }
}

try {
  const consumer = await installConsumer();
  const installedDist = join(consumer, "node_modules/@afcms/cowsay-ng/dist");
  const executable = join(installedDist, "bin/cowsay.mjs");

  await verifyNativeImports(consumer);
  await verifyShims(consumer, installedDist);
  await verifyEarlyExit(executable);
  await verifyCliOutput(installedDist);
  await verifyCliErrorsAndSelection(executable);
  await verifyConsumerTypes(consumer);
  await verifyBrowserBundles(consumer);
  await verifyEmittedCows(installedDist);

  console.log(
    `Packed package verified: ${fixture.cases.length} Perl fixtures, native lazy imports, pnpm shims, CLI errors/discovery/EPIPE, declarations, and browser bundle boundaries.`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
