// @ts-nocheck
import { logWarn } from "./app/lib/logger";

import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { ErrorBoundary } from "./app/components/error-boundary.tsx";
import { captureEvent, initObservability } from "./app/lib/observability.ts";
import "./styles/index.css";

import { ThemeProvider } from "./app/components/theme-provider.tsx";

// Bat loi toan cuc TRUOC khi render: neu App vo ngay lan render dau, su kien
// van kip vao telemetry.
initObservability();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error('Root element "#root" not found');
}

createRoot(rootEl).render(
  <ErrorBoundary area="app">
    <ThemeProvider defaultTheme="system" storageKey="neurobics-theme">
      <App />
    </ThemeProvider>
  </ErrorBoundary>,
);

import { registerSW } from "virtual:pwa-register";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      // Auto-reload for immediate update, matching previous custom behavior
      window.location.reload();
    },
    onRegisterError(err: unknown) {
      logWarn("Service worker registration failed:", err);
      captureEvent({
        event: "sw.register_failed",
        level: "warn",
        message: String(err),
      });
    }
  });
}
