/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
// @ts-nocheck
import { captureEvent } from "./observability";

const LEGACY_PREFIXES = ["mindgem."] as const;

export function migrateLegacyStorageKeys(): void {
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const legacy = LEGACY_PREFIXES.find((p) => key.startsWith(p));
    if (!legacy) continue;
    const nextKey = key.replace(legacy, "neurobics.");
    if (localStorage.getItem(nextKey) === null) {
      localStorage.setItem(nextKey, localStorage.getItem(key)!);
    }
    localStorage.removeItem(key);
    count++;
  }

  if (count > 0) {
    captureEvent({ event: "storage.migrated", message: String(count) });
  }
}
