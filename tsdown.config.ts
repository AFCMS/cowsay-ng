import { basename } from "node:path";

import { defineConfig } from "tsdown";

import metadata from "./package.json" with { type: "json" };

export default defineConfig({
  entry: ["src/index.ts", "src/core.ts", "src/cows/*.ts", "src/bin/*.ts"],
  root: "src",
  unbundle: true,
  copy: [
    { from: ["src/cows/*", "!src/cows/*.ts"], to: "dist/share/cowsay/cows" },
    { from: "notices/*", to: "dist/notices" },
    { from: "src/raw-cow.d.ts", to: "dist" },
  ],
  inputOptions: {
    external: [/\.cow$/, /^node:/],
  },
  outputOptions: {
    paths: (id) => (id.endsWith(".cow") ? `./share/cowsay/cows/${basename(id)}` : id),
  },
  define: { PACKAGE_VERSION: JSON.stringify(metadata.version) },
  format: ["esm"],
  outExtensions: () => ({ js: ".mjs", dts: ".d.mts" }),
  sourcemap: false,
  minify: true,
  dts: {
    generator: "tsgo",
  },
  platform: "neutral",
  target: "esnext",
  exports: false,
  publint: {
    enabled: true,
    level: "error",
    strict: true,
  },
  attw: {
    enabled: true,
    level: "error",
    profile: "esm-only",
  },
});
