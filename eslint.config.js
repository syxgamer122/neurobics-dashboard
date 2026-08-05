// Cau hinh ESLint 9 (flat config).
//
// Vi sao can: repo da co `tsc` (bat loi kieu) va `tests/scan.mjs` (quy tac noi
// bo), nhung KHONG co gi kiem tra quy tac React Hooks. App nay dung khoang 72
// useCallback + 11 useMemo - day chinh la noi sinh bug "stale closure": thieu
// mot bien trong deps thi handler giu gia tri cu mai mai, va tsc khong he thay.
//
// Nguyen tac: chay NHANH (khong bat che do type-aware). Loi that thi "error",
// con lai de "warn" de khong chan CI ngay hom nay - sua dan roi nang len sau.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "node_modules",
      "public",
      "sql-chia-nho",
      // Chay tren Deno + npm: specifier. CI da co buoc `deno check` rieng.
      "supabase/functions",
      // Chay trong Web Worker, tsconfig.worker.json lo phan kiem tra.
      "src/app/lib/sudoku-worker.ts",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // App + tests (TypeScript / React)
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // Ly do chinh de cai ESLint.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // tsc da lo phan nay, tat de khong bao trung.
      "no-undef": "off",

      // Cho phep `_ten` de danh dau "co y khong dung".
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // Khoang 30 cho dang dung `any`. Warn de thay so luong, khong chan CI.
      "@typescript-eslint/no-explicit-any": "warn",

      // console.log lot len production la mui code; warn/error thi giu lai.
      "no-console": ["warn", { allow: ["warn", "error"] }],

      eqeqeq: ["warn", "smart"],
      "prefer-const": "warn",
    },
  },

  // Script chay bang Node: tools/, tests/*.mjs, file config o goc
  {
    files: ["tools/**/*.{js,mjs}", "tests/**/*.mjs", "*.config.{js,mjs,ts}"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
    },
  },

  // Phai o CUOI: tat cac rule ve dinh dang de Prettier lo phan do.
  prettier,
);
