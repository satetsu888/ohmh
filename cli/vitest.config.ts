import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // cli/ 配下と repo root の shared/ 両方の *.test.ts を拾う。
    // shared/ は単独 package.json を持たないので cli の vitest 経由で実行する。
    include: ["src/**/*.test.ts", "../shared/**/*.test.ts"],
    environment: "node",
    // 各テストファイルを別プロセスにせず単一プロセスで実行 (起動オーバヘッド削減)
    pool: "forks",
  },
});
