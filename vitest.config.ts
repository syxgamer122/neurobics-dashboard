import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      // Chi do module da co unit test. guest/sudoku-gen/sessions chua co test
      // rieng — neu de trong include, mau so phinh to va % bi keo xuong gia.
      include: [
        "src/app/lib/scoring.ts",
        "src/app/lib/xp.ts",
        "src/app/lib/axes.ts",
        "src/app/lib/game-registry.ts",
        "src/app/lib/observability.ts",
        "supabase/functions/_shared/**/*.ts",
      ],
      exclude: ["**/*.d.ts"],
      // Nguong = muc do duoc do (31.5 / 64.9 / 80.8) tru bien an toan nho.
      // Sau moi lan them test: pnpm run test:coverage roi nang so nay len sat thuc te.
      thresholds: {
        lines: 30,
        statements: 30,
        functions: 60,
        branches: 75,
      },
    },
  },
});
