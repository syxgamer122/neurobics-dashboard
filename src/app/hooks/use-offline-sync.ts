import { useEffect, useState, useRef } from "react";
import { getOfflineQueue, syncOfflineQueue } from "../lib/offline-queue";
import { syncOfflineRounds } from "../lib/api";
import { logError } from "../lib/logger";

export function useOfflineSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);

  // Cập nhật số lượng pending
  useEffect(() => {
    const updateCount = () => {
      setPendingCount(getOfflineQueue().length);
    };
    updateCount();

    window.addEventListener("offline-queue-updated", updateCount);
    return () => {
      window.removeEventListener("offline-queue-updated", updateCount);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setPendingCount(getOfflineQueue().length);

    const handleOnline = async () => {
      const queue = getOfflineQueue();
      if (queue.length === 0 || syncingRef.current || !navigator.onLine) return;

      syncingRef.current = true;
      setIsSyncing(true);
      try {
        await syncOfflineQueue(syncOfflineRounds);
        window.dispatchEvent(new Event("offline-sync-complete"));
      } catch (err) {
        logError("Auto sync failed:", err);
      } finally {
        syncingRef.current = false;
        setIsSyncing(false);
        refresh();
      }
    };

    const onQueueUpdated = () => {
      refresh();
      if (navigator.onLine) void handleOnline();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline-queue-updated", onQueueUpdated);

    // Thu sync ngay luc khoi dong neu co mang
    if (navigator.onLine) {
      void handleOnline();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline-queue-updated", onQueueUpdated);
    };
  }, []);

  return { isSyncing, pendingCount };
}
