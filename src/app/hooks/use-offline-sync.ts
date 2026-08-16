import { useEffect, useState, useRef } from "react";
import { getOfflineQueue, syncOfflineQueue } from "../lib/offline-queue";
import { syncOfflineRounds } from "../lib/api";
import { logError } from "../lib/logger";

export function useOfflineSync(userId?: string | null) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);

  // Cập nhật số lượng pending
  useEffect(() => {
    const updateCount = async () => {
      if (!userId) {
        setPendingCount(0);
      } else {
        const q = await getOfflineQueue(userId);
        setPendingCount(q.length);
      }
    };
    void updateCount();

    window.addEventListener("offline-queue-updated", updateCount);
    return () => {
      window.removeEventListener("offline-queue-updated", updateCount);
    };
  }, [userId]);

  useEffect(() => {
    const refresh = async () => {
      if (!userId) setPendingCount(0);
      else {
        const q = await getOfflineQueue(userId);
        setPendingCount(q.length);
      }
    };

    const handleOnline = async () => {
      if (!userId) return;
      const queue = await getOfflineQueue(userId);
      if (queue.length === 0 || syncingRef.current || !navigator.onLine) return;

      syncingRef.current = true;
      setIsSyncing(true);
      try {
        const { results } = await syncOfflineQueue(userId, syncOfflineRounds);
        if (results && results.length > 0) {
          const rejected = results.filter((r) => r.status === "rejected").length;
          if (rejected > 0) {
             console.warn(`Sync: ${rejected} rounds rejected.`);
          }
        }
        window.dispatchEvent(new Event("offline-sync-complete"));
      } catch (err) {
        logError("Auto sync failed:", err);
      } finally {
        syncingRef.current = false;
        setIsSyncing(false);
        void refresh();
      }
    };

    const onQueueUpdated = () => {
      void refresh();
      if (navigator.onLine) void handleOnline();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline-queue-updated", onQueueUpdated);

    // Thử sync ngay lúc khởi động nếu có mạng
    if (navigator.onLine) {
      void handleOnline();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline-queue-updated", onQueueUpdated);
    };
  }, [userId]);

  return { isSyncing, pendingCount };
}
