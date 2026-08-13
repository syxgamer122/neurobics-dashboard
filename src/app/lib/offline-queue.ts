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

export function getOfflineQueue(): OfflineRoundPayload[] {
  try {
    const data = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to read offline queue:", err);
    return [];
  }
}

export function pushOfflineRound(round: Omit<OfflineRoundPayload, "clientRoundId" | "schemaVersion" | "createdAt">): boolean {
  try {
    const queue = getOfflineQueue();
    queue.push({
      ...round,
      clientRoundId: crypto.randomUUID(),
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new Event("offline-queue-updated"));
    return true;
  } catch (err) {
    console.error("Failed to push to offline queue:", err);
    return false;
  }
}

export function clearOfflineQueue(): void {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

export type SyncResult = { clientRoundId: string; status: "ok" | "duplicate" | "rejected" | "error" };

// Hàm đồng bộ lên server khi có mạng
export async function syncOfflineQueue(
  syncEndpoint: (payload: {
    rounds: OfflineRoundPayload[];
  }) => Promise<{ results: SyncResult[] }>,
): Promise<void> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  try {
    const response = await syncEndpoint({ rounds: queue });
    const results = response.results || [];
    
    // Only remove items that are ok, duplicate, or rejected. Keep others (e.g. error/timeout).
    const processedIds = new Set(
      results
        .filter((r) => r.status === "ok" || r.status === "duplicate" || r.status === "rejected")
        .map((r) => r.clientRoundId)
    );

    const newQueue = queue.filter((item) => !processedIds.has(item.clientRoundId));
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(newQueue));
  } catch (err) {
    console.error("Failed to sync offline queue:", err);
    throw err;
  }
}
