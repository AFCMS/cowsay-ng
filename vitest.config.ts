import { readFile } from "node:fs/promises";

import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "cow-text-fixtures",
      /**
       * Loads raw cow source for tests without requiring a native text-module runtime.
       */
      async load(id) {
        if (id.endsWith(".cow")) {
          const source = await readFile(id, "utf8");
          return `export default ${JSON.stringify(source)};`;
        }
      },
    },
  ],
  test: { pool: "threads" },
});
