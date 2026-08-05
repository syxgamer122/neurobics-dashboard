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
      // Nguong duoc ghim sat muc do duoc ngay 2026-08-05 (53.69 / 91.86 /
      // 72.04 / 53.69), chua lai vai diem dem cho bien dong nho. AI XOA TEST
      // hoac viet code moi khong kem test thi CI do ngay o buoc coverage.
      // Khi them test moi lam phu tang len, hay nang nguong theo cho sat lai.
      thresholds: {
        lines: 50,
        statements: 50,
        functions: 70,
        branches: 88,
      },
    },
  },
});
