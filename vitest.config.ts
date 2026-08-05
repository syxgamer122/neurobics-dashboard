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
      include: [
        "src/app/lib/scoring.ts",
        "src/app/lib/xp.ts",
        "src/app/lib/axes.ts",
        "src/app/lib/achievements.ts",
        "src/app/lib/quest-labels.ts",
        "src/app/lib/game-registry.ts",
        "src/app/lib/observability.ts",
        "supabase/functions/_shared/**/*.ts",
      ],
      exclude: ["**/*.d.ts"],
      thresholds: {
        lines: 30,
        statements: 30,
        functions: 60,
        branches: 75,
      },
    },
  },
});
