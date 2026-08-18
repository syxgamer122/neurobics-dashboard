const fs = require('fs');
const file = 'docs/feature_offline_pwa.txt';
let text = fs.readFileSync(file, 'utf8');

text = text.replace(/export function pushOfflineRound\(round: ClientRoundPayload\) \{[\s\S]*?writeOfflineQueue\(queue\);\s*\/\/ Ghi vAo IndexedDB.*?\n\}/i, 
\export async function pushOfflineRound(userId: string, round: ClientRoundPayload) {
  if (await countPendingRounds(userId) >= 200) {
    throw new Error('QueueFullError: Sync online before playing more');
  }

  await db.put("offlineRounds", {
    ...round,
    userId,
    clientRoundId: crypto.randomUUID(),
    status: "pending",
    attemptCount: 0,
    createdAt: new Date().toISOString()
  });

  document.dispatchEvent(new CustomEvent('offline-queue-updated'));
}\);

text = text.replace(/export async function syncOfflineQueue\(\) \{[\s\S]*?\[??c li freshQueue t IndexedDB.*?\]\n\}/,
\export async function syncOfflineQueue(userId: string) {
  await navigator.locks.request(
    \offline-sync:\\,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return;
      await processSyncQueue(userId);
    }
  );
}\);

fs.writeFileSync(file, text, 'utf8');
