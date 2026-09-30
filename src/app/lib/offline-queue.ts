/* eslint-disable react-hooks/exhaustive-deps */
import { TELEMETRY_SCHEMA_VERSION } from "./telemetry-version";
import { type RoundGame } from "./api";
import { logError } from "./logger";

export interface OfflineRoundPayload {
  clientRoundId: string;
  schemaVersion: number;
  game: RoundGame;
  telemetry: unknown;
  fingerprint: string;
  startedAt: string;
  clientElapsedMs: number;
  createdAt: string;
  userId: string;
}

const DB_NAME = "mindgem_offline";
const STORE_NAME = "rounds";
const MAX_QUEUE = 200;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "clientRoundId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineQueue(
  userId: string,
): Promise<OfflineRoundPayload[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result as OfflineRoundPayload[];
        resolve(
          all
            .filter((r) => r.userId === userId)
            .sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime(),
            ),
        );
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/**
 * In-process mutex queues. Used when the Web Locks API is unavailable
 * (older browsers, insecure contexts, workers, tests) or when acquiring a
 * Web Lock fails, so concurrent callers are still serialized per lock name.
 */
const localLockQueues = new Map<string, Promise<unknown>>();

async function withLocalLock<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = localLockQueues.get(name) ?? Promise.resolve();
  // Chain onto the previous holder whether it resolved or rejected.
  const run = previous.then(fn, fn);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  localLockQueues.set(name, settled);
  try {
    return await run;
  } finally {
    if (localLockQueues.get(name) === settled) {
      localLockQueues.delete(name);
    }
  }
}

/**
 * Safely execute an asynchronous operation with Web Locks API if available,
 * falling back to an in-process mutex if navigator.locks is unavailable.
 * Errors thrown by `fn` are propagated to the caller — never retried.
 */
export async function withLock<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (typeof navigator !== "undefined" && navigator?.locks?.request) {
    let acquired = false;
    try {
      return await navigator.locks.request(name, async () => {
        acquired = true;
        return await fn();
      });
    } catch (err) {
      // Only fall back when the lock itself could not be acquired. If the
      // critical section ran and threw, re-running it would duplicate writes.
      if (acquired) throw err;
      logError(
        `WebLock [${name}] acquisition failed, using in-process fallback:`,
        err,
      );
    }
  }
  return withLocalLock(name, fn);
}

export async function pushOfflineRound(
  userId: string,
  round: Omit<
    OfflineRoundPayload,
    "clientRoundId" | "schemaVersion" | "createdAt"
  >,
): Promise<boolean> {
  try {
    return await withLock("offline-queue-" + userId, async () => {
      const currentQueue = await getOfflineQueue(userId);
      if (currentQueue.length >= MAX_QUEUE) {
        throw new Error(
          "Offline queue is full (max 200 rounds). Please connect to the internet to sync.",
        );
      }

      const payload: OfflineRoundPayload = {
        ...round,
        clientRoundId: crypto.randomUUID(),
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        userId,
      };

      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put(payload);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      window.dispatchEvent(new Event("offline-queue-updated"));
      return true;
    });
  } catch (err) {
    logError("Failed to push to offline queue:", err);
    return false;
  }
}

export async function removeOfflineRounds(
  clientRoundIds: string[],
): Promise<void> {
  if (!clientRoundIds.length) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const id of clientRoundIds) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    window.dispatchEvent(new Event("offline-queue-updated"));
  } catch (err) {
    logError("Failed to remove from offline queue:", err);
  }
}

export type SyncResult = {
  clientRoundId: string;
  status: "ok" | "duplicate" | "rejected" | "error";
};

export async function syncOfflineQueue(
  userId: string,
  syncEndpoint: (payload: {
    rounds: OfflineRoundPayload[];
  }) => Promise<{ results: SyncResult[] }>,
): Promise<{ results: SyncResult[] }> {
  let allResults: SyncResult[] = [];
  let batches = 0;

  try {
    await withLock("offline-sync-" + userId, async () => {
      while (batches < 8) {
        const ownedSnapshot = await getOfflineQueue(userId);
        if (ownedSnapshot.length === 0) break;

        const batch = ownedSnapshot.slice(0, 25);
        try {
          batches++;
          const response = await syncEndpoint({ rounds: batch });
          const results = response.results || [];
          allResults = allResults.concat(results);

          const settledIds = results
            .filter(
              (r) =>
                r.status === "ok" ||
                r.status === "duplicate" ||
                r.status === "rejected",
            )
            .map((r) => r.clientRoundId);

          if (settledIds.length === 0) break;

          await removeOfflineRounds(settledIds);

          const freshQueue = await getOfflineQueue(userId);
          if (freshQueue.length > 0 && batches < 8) {
            await new Promise((res) => setTimeout(res, 1000 * batches));
          }
        } catch (err) {
          logError("Failed to sync offline batch:", err);
          if (allResults.length === 0) throw err;
          break;
        }
      }
    });
  } catch (err) {
    logError("Failed to lock sync:", err);
  }

  return { results: allResults };
}
