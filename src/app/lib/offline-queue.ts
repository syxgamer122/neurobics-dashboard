import { type RoundGame } from "./api";

export interface OfflineRoundPayload {
  clientRoundId: string;
  schemaVersion: number;
  game: RoundGame;
  telemetry: unknown;
  fingerprint: string;
  startedAt: string;
  clientElapsedMs: number;
  createdAt: string;
}

const OFFLINE_QUEUE_KEY = "neurobics_offline_queue";

const MAX_QUEUE = 200;

export function getOfflineQueue(): OfflineRoundPayload[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeOfflineQueue(q: OfflineRoundPayload[]): void {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  window.dispatchEvent(new Event("offline-queue-updated"));
}

export function pushOfflineRound(round: Omit<OfflineRoundPayload, "clientRoundId" | "schemaVersion" | "createdAt">): boolean {
  try {
    const queue = getOfflineQueue();
    if (queue.length >= MAX_QUEUE) {
      queue.shift(); // FIFO
    }
    queue.push({
      ...round,
      clientRoundId: crypto.randomUUID(),
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
    });
    writeOfflineQueue(queue);
    return true;
  } catch (err) {
    console.error("Failed to push to offline queue:", err);
    return false;
  }
}

export function clearOfflineQueue(): void {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
  window.dispatchEvent(new Event("offline-queue-updated"));
}

export type SyncResult = { clientRoundId: string; status: "ok" | "duplicate" | "rejected" | "error" };

// Hàm đồng bộ lên server khi có mạng
export async function syncOfflineQueue(
  syncEndpoint: (payload: {
    rounds: OfflineRoundPayload[];
  }) => Promise<{ results: SyncResult[] }>,
): Promise<void> {
  const queueSnapshot = getOfflineQueue();
  if (queueSnapshot.length === 0) return;

  try {
    // Only send the first 25 to avoid overwhelming the server
    const batch = queueSnapshot.slice(0, 25);
    const response = await syncEndpoint({ rounds: batch });
    const results = response.results || [];
    
    // Only remove items that are ok, duplicate, or rejected. Keep others (e.g. error/timeout).
    const settledIds = new Set(
      results
        .filter((r) => r.status === "ok" || r.status === "duplicate" || r.status === "rejected")
        .map((r) => r.clientRoundId)
    );

    // Re-read queue before writing to avoid race condition (losing rounds played during await)
    const freshQueue = getOfflineQueue();
    const newQueue = freshQueue.filter((item) => !settledIds.has(item.clientRoundId));
    writeOfflineQueue(newQueue);
  } catch (err) {
    console.error("Failed to sync offline queue:", err);
    throw err;
  }
}
