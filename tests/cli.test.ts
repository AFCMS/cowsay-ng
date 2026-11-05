import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";

import { describe, expect, it } from "vitest";

import { parseCliArgs } from "../src/cli/args.ts";
import { cowPath, definedCows, discover, selectCow, resolveCow } from "../src/cli/discovery.ts";

describe("Perl option adapter", () => {
  it("supports grouping, attached values, and the fixed face precedence", () => {
    expect(parseCliArgs(["-yd", "-e^^", "-TVV", "-W8", "hello", "-n"]).options).toEqual({
      eyes: "..",
      tongue: "U ",
      wrapColumn: 8,
      preserveWhitespace: false,
    });
    expect(parseCliArgs(["-by", "-fsmall", "hello", "-n"]).message).toEqual(["hello", "-n"]);
    expect(parseCliArgs(["-ne", "", "--", "-hello"]).options).toEqual({
      eyes: "",
      preserveWhitespace: true,
    });
    expect(parseCliArgs(["--", "--version"]).version).toBe(false);
    expect(parseCliArgs(["-", "-b"]).message).toEqual(["-", "-b"]);
    expect(parseCliArgs(["0"]).message).toEqual(["0"]);
  });
  it.each([["-f"], ["-q"], ["--unknown"], ["-W1"], ["-W2.5"], ["-WInfinity"]])(
    "rejects invalid arguments %j",
    (...args) => {
      expect(() => parseCliArgs(args)).toThrow();
    },
  );
  it.each(["", "0", "00", "01", "true", "false", "-d", "--", "=", ":value"])(
    "preserves string option values %j without coercion",
    (value) => {
      const parsed = parseCliArgs(["-e", value, "-T", value, "-f", value, "hello"]);
      expect(parsed.options.eyes).toBe(value);
      expect(parsed.options.tongue).toBe(value);
      expect(parsed.cow).toBe(value);
      expect(parsed.message).toEqual(["hello"]);
    },
  );
  it("keeps the last repeated value and does not leak parser state between calls", () => {
    const parsed = parseCliArgs([
      "-e00",
      "-e",
      "",
      "-T0",
      "-T01",
      "-fsmall",
      "-fdefault",
      "-W8",
      "-W20",
      "-bb",
      "--help",
    ]);
    expect(parsed.options).toEqual({
      eyes: "==",
      tongue: "01",
      wrapColumn: 20,
      preserveWhitespace: false,
    });
    expect(parsed.cow).toBe("default");
    expect(parsed.help).toBe(true);
    expect(parseCliArgs([])).toEqual({
      options: { preserveWhitespace: false },
      message: [],
      cow: undefined,
      random: false,
      color: false,
      list: false,
      help: false,
      version: false,
    });
    expect(parseCliArgs(["-e00", "-e", ""]).options.eyes).toBe("");
  });
});

describe("prefix-relative cow discovery", () => {
  it("preserves directory precedence, optional paths, recursive names, and existing files", async () => {
    const prefix = await mkdtemp(join(tmpdir(), "cowsay-discovery-"));
    try {
      const site = join(prefix, "share/cowsay/site-cows");
      const bundled = join(prefix, "share/cowsay/cows");
      const config = join(prefix, "etc/cowsay/cowpath.d");
      const configured = join(prefix, "configured");
      const user = join(prefix, "user");
      await Promise.all(
        [site, join(bundled, "truecolor"), config, configured, user].map((path) =>
          mkdir(path, { recursive: true }),
        ),
      );
      await Promise.all(
        [
          [join(site, "same.cow"), "site"],
          [join(bundled, "same.cow"), "bundled"],
          [join(bundled, "truecolor/rgb.cow"), "color"],
          [join(bundled, "exact"), "no extension"],
          [join(configured, "added.cow"), "added"],
          [join(user, "user.cow"), "user"],
          [join(config, "10-extra.path"), configured + "\n"],
          [join(config, "ignored.txt"), "/should-not-appear"],
        ].map(([path, content]) => writeFile(path!, content!)),
      );
      const paths = await cowPath(prefix, { COWPATH: [user, site].join(delimiter) });
      expect(paths).toEqual([site, bundled, configured, user]);
      expect(await cowPath(prefix, { COWPATH: user, COWSAY_ONLY_COWPATH: "1" })).toEqual([user]);
      expect(await cowPath(prefix, { COWSAY_ONLY_COWPATH: "1" })).toEqual([
        site,
        bundled,
        configured,
      ]);
      expect(await definedCows(paths)).toEqual(["added", "same", "truecolor/rgb", "user"]);
      expect(await resolveCow("same", paths)).toBe(join(site, "same.cow"));
      expect(await resolveCow("same.cow", paths)).toBe(join(site, "same.cow"));
      expect(await resolveCow("exact", paths)).toBe(join(bundled, "exact"));
      expect(await selectCow(join(user, "user.cow"), paths)).toBe(join(user, "user.cow"));
      expect(await discover(join(prefix, "missing"))).toEqual([]);
      await expect(resolveCow("missing", paths)).rejects.toThrow("Could not find cowfile");
    } finally {
      await rm(prefix, { recursive: true, force: true });
    }
  });
});
