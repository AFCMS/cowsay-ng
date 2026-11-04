import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/cli.ts"],
  format: ["esm"],
  sourcemap: false,
  minify: true,
  dts: {
    generator: "tsgo",
  },
  platform: "node",
  exports: true,
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
