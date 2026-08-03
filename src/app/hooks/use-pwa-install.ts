import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

type InstallOutcome = "accepted" | "dismissed" | "unavailable";

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean })
    .standalone;
  return Boolean(
    iosStandalone || window.matchMedia("(display-mode: standalone)").matches,
  );
}

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Khoi tao listener ngay khi module duoc import. Neu doi den luc mo trang Ho so,
// su kien beforeinstallprompt co the da phat xong va nut Cai dat se khong hien.
if (typeof window !== "undefined") {
  installed = detectStandalone();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

export function usePwaInstall() {
  const [, refresh] = useState(0);

  useEffect(() => {
    const listener = () => refresh((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallOutcome> => {
    const prompt = deferredPrompt;
    if (!prompt) return "unavailable";

    await prompt.prompt();
    const choice = await prompt.userChoice;
    // Moi BeforeInstallPromptEvent chi duoc dung mot lan, ke ca khi nguoi dung tu choi.
    deferredPrompt = null;
    if (choice.outcome === "accepted") installed = true;
    emit();
    return choice.outcome;
  }, []);

  return {
    canInstall: deferredPrompt !== null,
    isInstalled: installed || detectStandalone(),
    isIos: detectIos(),
    install,
  };
}
