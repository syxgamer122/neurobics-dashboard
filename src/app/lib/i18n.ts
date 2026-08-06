// Tach khoi i18n.tsx cu.
//
// Vi sao tach: file cu vua xuat component (`LangProvider`) vua xuat hang thuong
// (`translations`, `useLang`). Voi Vite Fast Refresh, mot file nhu vay khong
// hot-reload duoc — sua mot chu trong ban dich la reload ca trang, mat sach
// trang thai van dang choi. Quy tac react-refresh/only-export-components bat
// dung cho nay.
//
// Cach chia: file .ts nay chi chua thu KHONG phai component, con `LangProvider`
// nam rieng o `lang-provider.tsx`.
//
// Duong dan import cua 25 file khac KHONG doi: chung viet `from "../lib/i18n"`
// khong kem duoi file, nen doi .tsx -> .ts la trong suot. Chi App.tsx phai sua
// vi no la noi duy nhat import `LangProvider`.

import { createContext, useContext } from "react";
import { vi } from "./i18n/vi";
import { en } from "./i18n/en";

export type Lang = "vi" | "en";
export type Translation = typeof vi;
export const translations = { vi, en };

export type LangCtx = {
  lang: Lang;
  toggle: () => void;
  t: Translation;
};

// Export de `lang-provider.tsx` dung duoc. Gia tri mac dinh giu nguyen nhu cu:
// tieng Viet, `toggle` rong — de component nao lo nam ngoai Provider van render
// duoc chu khong nem loi.
export const LangContext = createContext<LangCtx>({
  lang: "vi",
  toggle: () => {},
  t: vi,
});

export function useLang() {
  return useContext(LangContext);
}
