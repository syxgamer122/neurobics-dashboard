import { logWarn } from "./app/lib/logger";

import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { ErrorBoundary } from "./app/components/error-boundary.tsx";
import { captureEvent, initObservability } from "./app/lib/observability.ts";
import "./styles/index.css";

// Bat loi toan cuc TRUOC khi render: neu App vo ngay lan render dau, su kien
// van kip vao telemetry.
initObservability();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary area="app">
    <App />
  </ErrorBoundary>,
);

// PWA: chi dang ky o ban build that. Trong dev server, service worker se
// cache nham module cua Vite va gay loi kho hieu.
//
// Ep ban moi: goi registration.update() moi lan load + reload khi controller
// thay doi, de sau deploy nguoi dung khong ket o bundle cu (vd. panel nhiem
// vu van hien w_games_7 thay vi nhan tieng Viet).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        void reg.update();
        // Neu co ban waiting san, ep activate ngay.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => {
        logWarn("Service worker registration failed:", err);
        captureEvent({
          event: "sw.register_failed",
          level: "warn",
          message: String(err),
        });
      });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}
