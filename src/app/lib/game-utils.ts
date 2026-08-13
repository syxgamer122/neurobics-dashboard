import { useCallback, useEffect, useRef } from "react";

/* ── localStorage an toàn: chặn NaN, chặn SSR, chặn quota error ── */
export function readIntStorage(key: string, fallback = 0): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    const n = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function writeIntStorage(key: string, value: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(value)) return;
  try {
    window.localStorage.setItem(key, String(Math.floor(value)));
  } catch {
    /* private mode / quota */
  }
}

/** Chỉ ghi nếu tốt hơn. Dùng cho "best time" (nhỏ hơn = tốt hơn). */
export function writeBestLower(key: string, ms: number): void {
  const cur = readIntStorage(key, Number.MAX_SAFE_INTEGER);
  if (ms < cur) writeIntStorage(key, ms);
}

/** Chỉ ghi nếu tốt hơn. Dùng cho "best score" (lớn hơn = tốt hơn). */
export function writeBestHigher(key: string, score: number): void {
  const cur = readIntStorage(key, -1);
  if (score > cur) writeIntStorage(key, score);
}

/** Đang gõ chữ thì đừng ăn phím của người ta */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Listener bàn phím dùng chung: tự bỏ qua khi user đang gõ, và luôn gọi bản
 * handler MỚI NHẤT (không cần đưa handler vào deps → không remount listener).
 */
export function useGameKeys(
  handler: (e: KeyboardEvent) => void,
  enabled: boolean,
): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.repeat && e.code === "Space") return; // chặn auto-repeat giữ Space
      ref.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** Chặn game chạy nền — để auto-pause / huỷ ván. */
export function useOnHidden(fn: () => void, enabled = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") ref.current();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onVis);
    };
  }, [enabled]);
}

/** Khoá input dùng chung — thay cho mọi guard bằng state. */
export function useInputLock() {
  const locked = useRef(false);
  const tryAcquire = useCallback(() => {
    if (locked.current) return false;
    locked.current = true;
    return true;
  }, []);
  const release = useCallback(() => {
    locked.current = false;
  }, []);
  return { tryAcquire, release, lockedRef: locked };
}

/** Set timeout có theo dõi + tự dọn dẹp. */
export function useGameTimers() {
  const ids = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    ids.current.forEach(clearTimeout);
    ids.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      ids.current = ids.current.filter((x) => x !== id);
      fn();
    }, ms);
    ids.current.push(id);
    return id;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);
  return { later, clearTimers };
}

/** Fisher–Yates tại chỗ. */
export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** roundRect fallback cho Safari < 16. */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Mọi game gửi CẢ BA. Server tự chọn cái nào để chấm, không phải đoán.
 *  - wallClockMs : thời gian thực từ lúc bắt đầu tới lúc kết thúc
 *  - activeMs    : chỉ phần người chơi thật sự phản hồi (trừ flash/memorize/ISI)
 *  - sampleCount : số mẫu RT thật (0 = không có mẫu nào → đừng chấm tốc độ)
 */
export type TimingPayload = {
  wallClockMs: number;
  activeMs: number;
  sampleCount: number;
};

export function buildTiming(startedAt: number, rts: number[]): TimingPayload {
  const wall = Date.now() - startedAt;
  const active = rts.reduce((a, b) => a + b, 0);
  return {
    wallClockMs: wall,
    activeMs: Math.min(wall, Math.max(0, Math.round(active))),
    sampleCount: rts.length,
  };
}
