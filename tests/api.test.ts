import { describe, expect, it, vi } from "vitest";

import { say as saySync } from "../src/core.ts";
import defaultCow from "../src/cows/default.ts";
import { list, loadCow, say, think } from "../src/index.ts";
import type { CowName } from "../src/index.ts";

describe("lazy public API", () => {
  it("returns sorted immutable names", () => {
    expect(list()).toHaveLength(54);
    expect(list()).toEqual(list().toSorted());
    expect(Object.isFrozen(list())).toBe(true);
    expect(list()).toBe(list());
  });
  it("shares compiled cows through native module caching, including concurrent loads", async () => {
    const cows = await Promise.all([
      loadCow("default"),
      loadCow("default"),
      loadCow("sheep"),
      loadCow("sheep"),
    ]);
    expect(cows[0]).toBe(defaultCow);
    expect(cows[0]).toBe(cows[1]);
    expect(cows[2]).toBe(cows[3]);
    expect(await say("hi")).toBe(saySync("hi", { cow: defaultCow }));
    expect(await say("hi", { cow: defaultCow })).toBe(await say("hi", { cow: "default" }));
    expect(await think("hi")).toContain("( hi )");
  });
  it.each(["../default", "default.cow", "__proto__", "toString", "missing", ""])(
    "rejects invalid name %s",
    async (name) => {
      await expect(loadCow(name)).rejects.toThrow("Unknown cow name");
    },
  );
  it("validates before loading and rejects conflicting selection", async () => {
    await expect(say("hi", { cow: "missing" as CowName, random: false })).rejects.toThrow(
      "cannot be specified together",
    );
    await expect(say("hi", { random: 1 as unknown as boolean })).rejects.toThrow("boolean");
    await expect(say(null as unknown as string)).rejects.toThrow("text must be a string");
  });
  it("chooses random cows from names", async () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    expect(await say("hi", { random: true })).toBe(await say("hi", { cow: list()[0] }));
    spy.mockRestore();
  });
});
