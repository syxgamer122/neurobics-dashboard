/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
// @ts-nocheck
import { TELEMETRY_SCHEMA_VERSION } from "./telemetry-version";
import { type RoundGame } from './api';
import { logError } from './logger';
import { currentUserId } from "./api/internal";

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

const DB_NAME = 'mindgem_offline';
const STORE_NAME = 'rounds';
const MAX_QUEUE = 200;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'clientRoundId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineQueue(userId: string): Promise<OfflineRoundPayload[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result as OfflineRoundPayload[];
        resolve(all.filter(r => r.userId === userId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function pushOfflineRound(
  userId: string,
  round: Omit<OfflineRoundPayload, 'clientRoundId' | 'schemaVersion' | 'createdAt'>
): Promise<boolean> {
  try {
    return await navigator.locks.request('offline-queue-' + userId, async () => {
      const currentQueue = await getOfflineQueue(userId);
      if (currentQueue.length >= MAX_QUEUE) {
        throw new Error('Offline queue is full (max 200 rounds). Please connect to the internet to sync.');
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
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(payload);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      window.dispatchEvent(new Event('offline-queue-updated'));
      return true;
    });
  } catch (err) {
    logError('Failed to push to offline queue:', err);
    return false;
  }
}

export async function removeOfflineRounds(clientRoundIds: string[]): Promise<void> {
  if (!clientRoundIds.length) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const id of clientRoundIds) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    window.dispatchEvent(new Event('offline-queue-updated'));
  } catch (err) {
    logError('Failed to remove from offline queue:', err);
  }
}

export type SyncResult = {
  clientRoundId: string;
  status: 'ok' | 'duplicate' | 'rejected' | 'error';
};

export async function syncOfflineQueue(
  userId: string,
  syncEndpoint: (payload: { rounds: OfflineRoundPayload[] }) => Promise<{ results: SyncResult[] }>
): Promise<{ results: SyncResult[] }> {
  let allResults: SyncResult[] = [];
  let batches = 0;

  try {
    await navigator.locks.request('offline-sync-' + userId, async () => {
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
            .filter(r => r.status === 'ok' || r.status === 'duplicate' || r.status === 'rejected')
            .map(r => r.clientRoundId);

          if (settledIds.length === 0) break;

          await removeOfflineRounds(settledIds);

          const freshQueue = await getOfflineQueue(userId);
          if (freshQueue.length > 0 && batches < 8) {
            await new Promise(res => setTimeout(res, 1000 * batches));
          }
        } catch (err) {
          logError('Failed to sync offline batch:', err);
          if (allResults.length === 0) throw err;
          break;
        }
      }
    });
  } catch (err) {
    logError('Failed to lock sync:', err);
  }

  return { results: allResults };
}

