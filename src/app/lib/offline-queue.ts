import { type RoundGame } from "./api";

export interface OfflineRoundPayload {
  game: RoundGame;
  telemetry: unknown;
  fingerprint: string;
  startedAt: string;
  clientElapsedMs: number;
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

export function pushOfflineRound(round: OfflineRoundPayload): void {
  const queue = getOfflineQueue();
  queue.push(round);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function clearOfflineQueue(): void {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

// Hàm đồng bộ lên server khi có mạng
export async function syncOfflineQueue(
  syncEndpoint: (payload: {
    rounds: OfflineRoundPayload[];
  }) => Promise<{ results: unknown[] }>,
): Promise<void> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  try {
    await syncEndpoint({ rounds: queue });
    // Nếu thành công (hoặc server từ chối nhưng đã xử lý), ta clear queue.
    // Thực tế, ta nên kiểm tra results để xử lý lỗi từng item,
    // nhưng để đơn giản ta clear toàn bộ.
    clearOfflineQueue();
  } catch (err) {
    console.error("Failed to sync offline queue:", err);
    throw err;
  }
}
