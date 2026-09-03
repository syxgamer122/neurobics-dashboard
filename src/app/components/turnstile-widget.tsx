import { useCallback, useEffect, useRef, useState } from "react";

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

/** Trạng thái captcha mà parent (auth-screen) quan tâm. Không có "idle". */
export type TurnstileStatus = "loading" | "ready" | "error" | "missing_key";

export function TurnstileWidget({
  onToken,
  resetKey,
  onState,
}: {
  onToken: (token: string) => void;
  resetKey: number;
  onState?: (s: TurnstileStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onStateRef = useRef(onState);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const [loadState, setLoadStateInner] = useState<LoadState>(
    siteKey ? "loading" : "missing_key",
  );
  // Tăng khi user bấm "Thử lại" trong widget: buộc effect render chạy lại.
  const [retryNonce, setRetryNonce] = useState(0);

  onTokenRef.current = onToken;
  onStateRef.current = onState;

  // Mọi đổi trạng thái đều đi qua đây để parent luôn được báo (fail-closed mềm:
  // parent biết captcha chưa ready nên không cho submit, nhưng không bypass).
  const updateState = useCallback((s: LoadState) => {
    setLoadStateInner(s);
    if (s !== "idle") onStateRef.current?.(s);
  }, []);

  useEffect(() => {
    if (!siteKey) {
      updateState("missing_key");
      return;
    }

    let cancelled = false;
    updateState("loading");

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
            if (!cancelled) updateState("error");
          },
        });
        if (!cancelled) updateState("ready");
      } catch {
        if (!cancelled) updateState("error");
      }
    };

    const onScriptError = () => {
      if (!cancelled) updateState("error");
    };

    const attachScript = () => {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderWidget, { once: true });
      script.addEventListener("error", onScriptError, { once: true });
      document.head.appendChild(script);
      return script;
    };

    // Script đang được lắng nghe để cleanup gỡ đúng listener.
    let listened: HTMLScriptElement | null = null;
    const existing = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.turnstile) {
        renderWidget();
      } else if (retryNonce > 0) {
        // Lần thử lại: script cũ đã lỗi/CSP chặn nên listener once cũ hết tác
        // dụng — xóa và tạo script mới để browser tải lại thật.
        try {
          existing.remove();
        } catch {
          /* ignore */
        }
        listened = attachScript();
      } else {
        existing.addEventListener("load", renderWidget, { once: true });
        existing.addEventListener("error", onScriptError, { once: true });
        listened = existing;
      }
    } else {
      listened = attachScript();
    }

    // CSP chan script -> load khong bao gio fire.
    const timeoutId = window.setTimeout(() => {
      if (!cancelled && !widgetIdRef.current && !window.turnstile) {
        updateState("error");
      }
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      listened?.removeEventListener("load", renderWidget);
      listened?.removeEventListener("error", onScriptError);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, retryNonce, updateState]);

  const isFirstResetRef = useRef(true);
  useEffect(() => {
    // Bỏ qua lần mount: tránh reset ngay khi vừa render.
    if (isFirstResetRef.current) {
      isFirstResetRef.current = false;
      return;
    }
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        /* ignore */
      }
      onTokenRef.current("");
    } else {
      // Parent bấm "Thử lại" (tăng resetKey) mà widget chưa render được
      // (đang error): thử render lại. Không xóa username/password — parent giữ.
      setRetryNonce((n) => n + 1);
    }
    // Chỉ nghe resetKey từ parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            border: "1px solid rgba(var(--neuro-red-rgb),0.35)",
            background: "rgba(var(--neuro-red-rgb),0.08)",
          }}
        >
          <div>
            Khong tai duoc captcha (thuong do CSP chan Cloudflare Turnstile hoac
            mat mang). Thu tai lai trang. Neu van loi, kiem tra Vercel CSP cho
            phep challenges.cloudflare.com.
          </div>
          <button
            type="button"
            onClick={() => {
              onTokenRef.current("");
              setRetryNonce((n) => n + 1);
            }}
            className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              border: "1px solid rgba(var(--neuro-red-rgb),0.4)",
              color: "var(--neuro-red)",
            }}
          >
            Thử lại
          </button>
        </div>
      )}
    </div>
  );
}
