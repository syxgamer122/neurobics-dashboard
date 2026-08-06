/**
 * Dev-gated logging + duong day len telemetry.
 *
 * Truoc day client goi console.error/console.warn thang, nen thong bao loi cua
 * Postgres (ten bang, ten cot, cau truy van) hien nguyen van trong DevTools o
 * production. Cac helper duoi day im lang o console khi build production.
 *
 * MOI (observability): o production chung KHONG con roi vao hu khong — logError
 * va logWarn day su kien da lam sach vao lop telemetry, nen loi thuc te o may
 * nguoi dung cuoi cung hien trong bang observability_events.
 *
 * Loi hien cho nguoi dung van di duong toast/throw nhu cu.
 */
import { captureError, captureMessage } from "./observability";

const IS_DEV = import.meta.env.DEV;

function describe(args: unknown[]): string {
  return args
    .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a)))
    .join(" ")
    .slice(0, 400);
}

export function logError(...args: unknown[]): void {
  if (IS_DEV) {
    console.error(...args);
    return;
  }
  const cause = args.find((a) => a instanceof Error);
  if (cause)
    captureError(cause, { event: "log.error", message: describe(args) });
  else captureMessage(describe(args), "error", { event: "log.error" });
}

export function logWarn(...args: unknown[]): void {
  if (IS_DEV) {
    console.warn(...args);
    return;
  }
  captureMessage(describe(args), "warn", { event: "log.warn" });
}

export function logInfo(...args: unknown[]): void {
  // Day la cho DUY NHAT trong src/ duoc phep goi console.info, va no da bi khoa
  // sau IS_DEV nen khong bao gio chay tren production. Tat rule dung mot dong
  // thay vi noi long cau hinh chung — nho vay moi console.info THEM MOI o cho
  // khac van bi ESLint bat.
  // eslint-disable-next-line no-console
  if (IS_DEV) console.info(...args);
}
