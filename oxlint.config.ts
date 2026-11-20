import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["oxc", "typescript", "import", "jsdoc", "promise", "vitest"],
  categories: {
    correctness: "error",
  },
  options: {
    typeAware: true,
  },
  rules: {
    "oxc/no-barrel-file": "error",
    "import/extensions": ["error", { checkTypeImports: true, ignorePackages: true }],
    "unicorn/prefer-node-protocol": "error",
    "vitest/valid-expect": ["error", { maxArgs: 2 }],
  },
});
