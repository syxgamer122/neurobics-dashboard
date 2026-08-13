import { useCallback, useSyncExternalStore } from "react";

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

let currentSnapshot = {
  canInstall: false,
  isInstalled: false,
  isIos: false,
};

function updateSnapshot() {
  const canInstall = deferredPrompt !== null;
  const isInstalled = installed || detectStandalone();
  const isIos = detectIos();
  if (
    currentSnapshot.canInstall !== canInstall ||
    currentSnapshot.isInstalled !== isInstalled ||
    currentSnapshot.isIos !== isIos
  ) {
    currentSnapshot = { canInstall, isInstalled, isIos };
  }
}

const emit = () => {
  updateSnapshot();
  listeners.forEach((listener) => listener());
};

if (typeof window !== "undefined") {
  installed = detectStandalone();
  updateSnapshot();

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

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => currentSnapshot;
const getServerSnapshot = () => ({
  canInstall: false,
  isInstalled: false,
  isIos: false,
});

export function usePwaInstall() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const install = useCallback(async (): Promise<InstallOutcome> => {
    const prompt = deferredPrompt;
    if (!prompt) return "unavailable";

    await prompt.prompt();
    const choice = await prompt.userChoice;
    deferredPrompt = null;
    if (choice.outcome === "accepted") installed = true;
    emit();
    return choice.outcome;
  }, []);

  return {
    ...state,
    install,
  };
}
