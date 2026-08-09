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

    // Lắng nghe thay đổi (có thể được gọi bằng custom event, nhưng ở đây dùng interval đơn giản)
    const interval = setInterval(updateCount, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      const queue = getOfflineQueue();
      if (queue.length === 0 || isSyncing) return;
      
      setIsSyncing(true);
      try {
        await syncOfflineQueue(syncOfflineRounds);
        setPendingCount(0);
      } catch (err) {
        console.error("Auto sync failed:", err);
      } finally {
        setIsSyncing(false);
      }
    };

    window.addEventListener("online", handleOnline);
    // Thu sync ngay luc khoi dong neu co mang
    if (navigator.onLine) {
      void handleOnline();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [isSyncing]);

  return { isSyncing, pendingCount };
}
