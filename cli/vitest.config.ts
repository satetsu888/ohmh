import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pick up *.test.ts from both cli/ and the sibling shared/ directory.
    // shared/ has no package.json of its own, so its tests are run through cli's vitest.
    include: ["src/**/*.test.ts", "../shared/**/*.test.ts"],
    environment: "node",
    pool: "forks",
  },
});
