import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 text-amber-500 dark:text-cyan-400 hover:scale-105 transition-all outline-none cursor-pointer shadow-sm"
      aria-label="Toggle theme"
      title="Chuyển đổi giao diện Sáng / Tối"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-cyan-400" />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
