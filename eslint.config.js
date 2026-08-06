// Cau hinh ESLint 9 (flat config).
//
// Vi sao can: repo da co `tsc` (bat loi kieu) va `tests/scan.mjs` (quy tac noi
// bo), nhung KHONG co gi kiem tra quy tac React Hooks. App nay dung khoang 72
// useCallback + 11 useMemo - day chinh la noi sinh bug "stale closure": thieu
// mot bien trong deps thi handler giu gia tri cu mai mai, va tsc khong he thay.
//
// Nguyen tac: chay NHANH (khong bat che do type-aware).
//
// 2026-08-06 — DA KHOA. Ban dau moi rule de "warn" de khong chan CI trong luc
// con 87 canh bao phai don. Nay da ve 0, nen ca cum rule "sinh bug that" duoc
// nang len "error". Kem theo do, script `lint` chay voi --max-warnings=0, nen
// tu gio MOT canh bao moi cung du lam do CI.
//
// Thieu hai thu nay thi con so 0 hom nay se lang le troi nguoc ve 87 sau vai
// thang, vi khong co gi chan lai ca.
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
      // Ly do chinh de cai ESLint. Ca hai deu la loi CHAY THAT, khong phai gu
      // tham my: sai thu tu hook thi vo state, thieu deps thi handler giu gia
      // tri cu vinh vien (stale closure) va tsc khong he thay.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      // Co tinh GIU "warn": rule nay chi anh huong Hot Reload luc dev, khong
      // phai loi chay. Van chan CI nho --max-warnings=0 — de "warn" chi de
      // trong editor no hien vang thay vi do, dung muc do nghiem trong that.
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // tsc da lo phan nay, tat de khong bao trung.
      "no-undef": "off",

      // Cho phep `_ten` de danh dau "co y khong dung". Nang len "error" sau vu
      // xoa ham chet `hasRegisteredGameComponent` lam mo coi import
      // `GAME_BY_ID` — khong ai thay cho den luc chay lint.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // `any` la lo thung xuyen thang qua tsc. Vu TS18047 o tests/sim-games.ts
      // chung minh dieu do: vua bo `any` ra thi lo nguyen hinh 19 cho deref
      // gia tri co the null, ton tai am tham tu lau.
      "@typescript-eslint/no-explicit-any": "error",

      // console.log lot len production khong chi la mui code — no do du lieu
      // nguoi dung ra devtools cho bat ky ai mo F12. warn/error thi giu lai.
      // Cac script CLI duoc mien rieng o khoi ben duoi.
      "no-console": ["error", { allow: ["warn", "error"] }],

      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
    },
  },

  // Script chay bang Node: tools/, tests/*.mjs, bo mo phong, file config o goc.
  //
  // `tests/sim-*.ts` la CLI harness chay bang `node --experimental-strip-types`,
  // KHONG phai test cua vitest. Viec cua chung la in bang ket qua ra terminal,
  // nen console.log o day la tinh nang chu khong phai mui code.
  //
  // Co tinh liet ke `sim-*` chu khong phai `tests/**/*.ts`: cac file *.test.ts
  // van phai bi bat neu lo lot console.log (hien tai ca 10 file deu sach).
  {
    files: [
      "tools/**/*.{js,mjs}",
      "tests/**/*.mjs",
      "tests/sim-*.ts",
      "*.config.{js,mjs,ts}",
    ],
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
