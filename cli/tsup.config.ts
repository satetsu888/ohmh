import { defineConfig } from "tsup";

export default defineConfig({
  entry: { ohmh: "src/index.ts" },
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  shims: false,
  minify: false,
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
  // shared/ も bundle に含める (相対 import で取り込み済み)
});
