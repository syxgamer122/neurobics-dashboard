
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(<App />);

  // PWA: chi dang ky o ban build that. Trong dev server, service worker se
  // cache nham module cua Vite va gay loi kho hieu.
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("Service worker registration failed:", err));
    });
  }
  