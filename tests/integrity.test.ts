import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

import { expect, it } from "vitest";

import snapshot from "../scripts/cows-snapshot.json" with { type: "json" };
import { list } from "../src/index.ts";

it("preserves all raw artwork and upstream notices byte for byte", () => {
  for (const [path, hash] of Object.entries(snapshot.files)) {
    const name = path.split("/").at(-1);
    const file = new URL(`../src/cows/${name}`, import.meta.url);
    const data = readFileSync(file);
    const actualHash = createHash("sha1")
      .update(`blob ${data.length}\0`)
      .update(data)
      .digest("hex");

    expect(actualHash, path).toBe(hash);
  }
  const rawNames = readdirSync(new URL("../src/cows", import.meta.url))
    .filter((name) => name.endsWith(".cow"))
    .map((name) => name.slice(0, -4))
    .toSorted();
  expect(rawNames).toEqual(list());
  expect(rawNames).toHaveLength(54);
});
