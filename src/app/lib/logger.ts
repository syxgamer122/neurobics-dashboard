/**
 * Dev-gated logging.
 *
 * Truoc day client goi console.error/console.warn thang, nen thong bao loi cua
 * Postgres (ten bang, ten cot, cau truy van) hien nguyen van trong DevTools o
 * production. Cac helper duoi day im lang khi build production va chi noi khi
 * chay dev, nen khong con ro ri chi tiet ha tang cho nguoi dung cuoi.
 *
 * Loi hien cho nguoi dung van di duong toast/throw nhu cu - day chi la kenh
 * chan doan cho lap trinh vien.
 */
const IS_DEV = import.meta.env.DEV;

export function logError(...args: unknown[]): void {
  if (IS_DEV) console.error(...args);
}

export function logWarn(...args: unknown[]): void {
  if (IS_DEV) console.warn(...args);
}

export function logInfo(...args: unknown[]): void {
  if (IS_DEV) console.info(...args);
}
