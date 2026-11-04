import { describe, it, expect } from "vitest";

describe("hello world", () => {
  it("passes the dummy test", () => {
    expect("hello world").toBe("hello world");
  });
});
