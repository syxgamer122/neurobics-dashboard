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
        // Liet ke ro tung file Edge thay vi glob ** de Windows/Linux do cung
        // mot mau so. Khi them file scoring moi, them no vao danh sach nay.
        "supabase/functions/_shared/anticheat.ts",
        "supabase/functions/_shared/observability.ts",
        "supabase/functions/_shared/round-scoring.ts",
        "supabase/functions/_shared/scoring/advanced-games.ts",
        "supabase/functions/_shared/scoring/core.ts",
        "supabase/functions/_shared/scoring/standard-games.ts",
        "supabase/functions/_shared/scoring/validation.ts",
      ],
      exclude: ["**/*.d.ts"],
      // BASELINE DA XAC NHAN TREN WINDOWS 2026-08-07 (214 test):
      //   statements 56.78% (1683/2964) | branches 91.79% (481/524)
      //   functions  61.81% (68/110)    | lines    56.78% (1683/2964)
      //
      // Truoc day threshold 60/65 duoc dat theo mot lan CI chi instrument
      // 2656 statement, trong khi Windows instrument du 2964 statement. Test
      // deu xanh nhung `pnpm run check` o may lai do. Danh sach include phia
      // tren da bo glob de hai OS do cung tap file; nguong nay dat thap hon
      // baseline 1–2 diem de chua bien dong nho, nhung van chan viec xoa test.
      // Khi test moi lam coverage tang, nang nguong theo so do TREN CA CI VA
      // Windows — khong nang theo rieng mot moi truong.
      thresholds: {
        lines: 55,
        statements: 55,
        functions: 60,
        branches: 90,
      },
    },
  },
});
