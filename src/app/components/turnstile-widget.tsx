import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          theme?: "light" | "dark" | "auto";
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type LoadState = "idle" | "loading" | "ready" | "error" | "missing_key";

export function TurnstileWidget({
  onToken,
  resetKey,
}: {
  onToken: (token: string) => void;
  resetKey: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const [loadState, setLoadState] = useState<LoadState>(
    siteKey ? "loading" : "missing_key",
  );

  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey) {
      setLoadState("missing_key");
      return;
    }

    let cancelled = false;
    setLoadState("loading");

    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "dark",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => {
            onTokenRef.current("");
            if (!cancelled) setLoadState("error");
          },
        });
        if (!cancelled) setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    };

    const onScriptError = () => {
      if (!cancelled) setLoadState("error");
    };

    const existing = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.turnstile) renderWidget();
      else {
        existing.addEventListener("load", renderWidget, { once: true });
        existing.addEventListener("error", onScriptError, { once: true });
      }
    } else {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderWidget, { once: true });
      script.addEventListener("error", onScriptError, { once: true });
      document.head.appendChild(script);
    }

    // CSP chan script -> load khong bao gio fire.
    const timeoutId = window.setTimeout(() => {
      if (!cancelled && !widgetIdRef.current && !window.turnstile) {
        setLoadState("error");
      }
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      existing?.removeEventListener("load", renderWidget);
      existing?.removeEventListener("error", onScriptError);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onTokenRef.current("");
    }
  }, [resetKey]);

  if (loadState === "missing_key") {
    return (
      <div
        className="text-xs text-amber-400 rounded-lg px-3 py-2"
        style={{ border: "1px solid rgba(251,191,36,0.3)" }}
      >
        Thieu VITE_TURNSTILE_SITE_KEY — kiem tra bien moi truong tren Vercel.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={containerRef}
        className="flex justify-center min-h-[65px] w-full"
        aria-label="Captcha verification"
      />
      {loadState === "loading" && (
        <p className="text-[11px] text-slate-500">Dang tai captcha…</p>
      )}
      {loadState === "error" && (
        <div
          className="w-full text-xs text-rose-300 rounded-lg px-3 py-2 leading-relaxed"
          style={{
            border: "1px solid rgba(244,63,94,0.35)",
            background: "rgba(244,63,94,0.08)",
          }}
        >
          Khong tai duoc captcha (thuong do CSP chan Cloudflare Turnstile hoac
          mat mang). Thu tai lai trang. Neu van loi, kiem tra Vercel CSP cho phep
          challenges.cloudflare.com.
        </div>
      )}
    </div>
  );
}
