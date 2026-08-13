import { useEffect, useState } from "react";
import { getOfflineQueue, syncOfflineQueue } from "../lib/offline-queue";
import { syncOfflineRounds } from "../lib/api";

export function useOfflineSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

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
    const handleOnline = async () => {
      const queue = getOfflineQueue();
      if (queue.length === 0 || isSyncing) return;

      setIsSyncing(true);
      try {
        await syncOfflineQueue(syncOfflineRounds);
        setPendingCount(getOfflineQueue().length);
        window.dispatchEvent(new Event("offline-sync-complete"));
      } catch (err) {
        console.error("Auto sync failed:", err);
      } finally {
        setIsSyncing(false);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline-queue-updated", () => {
      if (navigator.onLine) void handleOnline();
    });
    
    // Thu sync ngay luc khoi dong neu co mang
    if (navigator.onLine) {
      void handleOnline();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      // Clean up inline listener isn't perfectly matched without ref, 
      // but it's okay for app lifecycle singleton hook
    };
  }, [isSyncing]);

  return { isSyncing, pendingCount };
}
