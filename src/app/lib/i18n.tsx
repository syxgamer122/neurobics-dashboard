import { createContext, useContext, useState, type ReactNode } from "react";
import { vi } from "./i18n/vi";
import { en } from "./i18n/en";

export type Lang = "vi" | "en";
export type Translation = typeof vi;
export const translations = { vi, en };

type LangCtx = {
  lang: Lang;
  toggle: () => void;
  t: Translation;
};

const Ctx = createContext<LangCtx>({
  lang: "vi",
  toggle: () => {},
  t: vi,
});

function detectInitialLanguage(): Lang {
  try {
    const saved = localStorage.getItem("nb_lang");
    if (saved === "vi" || saved === "en") return saved;
  } catch {
    // Private mode/storage bị chặn: thử ngôn ngữ trình duyệt.
  }
  try {
    const tags = navigator.languages?.length
      ? navigator.languages
      : [navigator.language];
    for (const tag of tags) {
      const base = String(tag ?? "").toLowerCase().split("-")[0];
      if (base === "vi") return "vi";
      if (base === "en") return "en";
    }
    if (tags.length > 0) return "en";
  } catch {
    // SSR/test không có navigator: mặc định tiếng Việt.
  }
  return "vi";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(detectInitialLanguage);

  const toggle = () =>
    setLang((current) => {
      const next: Lang = current === "vi" ? "en" : "vi";
      try {
        localStorage.setItem("nb_lang", next);
      } catch {
        // Việc đổi ngôn ngữ vẫn hoạt động dù không lưu được preference.
      }
      return next;
    });

  return (
    <Ctx.Provider value={{ lang, toggle, t: translations[lang] }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLang() {
  return useContext(Ctx);
}
