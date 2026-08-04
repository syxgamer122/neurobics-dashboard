/**
 * Luoi an toan cuoi cua UI.
 *
 * React 18 unmount ca cay khi mot component nem loi khi render — tuc nguoi dung
 * thay MAN HINH TRANG va khong con cach nao bao loi. Boundary nay giu lai mot
 * man hinh loi tu te, gui van tay loi len telemetry, va cho phep thu lai ma
 * khong mat session.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureError, flushObservability } from "../lib/observability";
import { APP_VERSION_LABEL } from "../lib/version";

type Props = {
  children: ReactNode;
  /** Ten vung de biet cho nao vo: "app", "game:schulte", "admin-panel"… */
  area?: string;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, {
      event: "ui.crash",
      level: "fatal",
      route: typeof location !== "undefined" ? location.pathname : undefined,
      context: {
        area: this.props.area ?? "app",
        componentStack: (info.componentStack ?? "").slice(0, 400),
      },
    });
    flushObservability();
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  private reload = (): void => {
    if (typeof location !== "undefined") location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B1020] p-6 text-slate-200">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <p className="text-3xl">⚠️</p>
          <h1 className="mt-2 text-lg font-semibold text-white">
            Đã xảy ra lỗi ngoài dự kiến
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Lỗi đã được ghi nhận tự động. Bạn có thể thử lại mà không mất
            đăng nhập.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-rose-300">
            {error.name}: {error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="flex-1 rounded-xl bg-cyan-500/90 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
            >
              Thử lại
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="flex-1 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
            >
              Tải lại trang
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-500">
            Mindgem {APP_VERSION_LABEL}
          </p>
        </div>
      </div>
    );
  }
}
