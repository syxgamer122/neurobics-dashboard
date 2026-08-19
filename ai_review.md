<USER_REQUEST>
Tôi đã đọc kỹ cả 5 nhóm file. Codebase này chất lượng khá cao (comment giải thích tại sao, tách server-scoring, EMA hai chiều, redaction PII…), nhưng có một số lỗ hổng nghiêm trọng ở tầng offline và auth có thể phá vỡ toàn bộ tính toàn vẹn điểm số. Dưới đây là đánh giá theo mức độ ưu tiên.
Bảng tổng hợp
#
Vấn đề
Mức
File
Đ1
sync-offline-rounds bỏ qua toàn bộ kiểm tra thời gian server
 P0
routes/rounds.ts
Đ2
Một ván lỗi làm chết vĩnh viễn cả hàng đợi offline
 P0
routes/rounds.ts
Đ3
Rò rỉ listener → gửi trùng lặp theo cấp số
 P0
use-offline-sync.ts
Đ4
Race ghi đè hàng đợi → mất ván
 P0
offline-queue.ts
Đ5
Cache profile dùng chung 1 key → lộ dữ liệu giữa tài khoản
 P0
use-app-state.ts
Đ6
Recovery: không thu hồi session + mất mã vĩnh viễn
 P1
routes/auth.ts
Đ7
TOCTOU rate-limit signup
 P1
routes/auth.ts
Đ8
So sánh hash không hằng-thời-gian + legacy SHA-256 không khoá
 P1
routes/auth.ts
Đ9
Không có audit log cho hành động admin
 P1
routes/admin.ts
Đ10
Lỗi validation bị map thành HTTP 401
 P1
routes/rounds.ts
Đ11
Anti-cheat oracle: trả về tên detector cho client
 P1
routes/rounds.ts
Đ12
Nút "Gửi lại" không bao giờ thành công sau 422
 P1
use-round-submission.ts
Đ13
pushOfflineRound trả false nhưng bị bỏ qua → mất ván âm thầm
 P1
use-round-submission.ts
Đ14–17
4 false-positive anti-cheat
 P2
anticheat.ts
Đ18–21
MIN_POPULATION chết, decay xói mòn, scorer thứ 2, XP phẳng
 P2
scoring.ts, xp.ts
Đ22–28
Nhất quán / bảo trì
 P3
nhiều file
 P0 — Phải sửa trước khi phát hành
Đ1. /server/sync-offline-rounds là cửa hậu vô hiệu hoá toàn bộ anti-cheat
Đây là vấn đề nghiêm trọng nhất. Toàn bộ kiến trúc chống gian lận dựa trên serverElapsedMs = Date.now() - ticket.started_at — một con số server tự tính. Nhưng endpoint sync lại:
const fallbackStartedAt = startedAt || new Date().toISOString();  // client tự khai
const cheat = inspectRound(gameId, telemetry, clientElapsedMs || 0); // client tự khai
const scored = scoreAndValidate(gameId, telemetry, clientElapsedMs || 0);

Hệ quả: chỉ cần chặn mạng (DevTools → Offline), prepareRound sẽ rơi vào nhánh isNetworkErrorLike và cấp ticket giả offline-*. Sau đó kẻ gian gửi thẳng POST /server/sync-offline-rounds với telemetry hoàn hảo + clientElapsedMs tuỳ ý, không giới hạn số phần tử mảng, không rate limit. Farm XP/trục vô hạn.
Thêm nữa clientElapsedMs || 0 khiến inspectShared so timeMs - 0 > 5000 → gần như mọi ván offline hợp lệ đều dính soft flag rác, làm ô nhiễm bảng cheat_flags.
Giải pháp tối ưu — pre-mint ticket khi còn mạng. Đừng cho client tự khai thời gian; hãy cấp sẵn ticket thật lúc online:
// Client: khi online, warm sẵn một pool nhỏ (vd. 3 ticket/game), lưu localStorage.
// Khi offline, ván tiêu thụ một ticket THẬT đã có server-issued id + started_at.
// Khi sync, server chỉ cần redeem ticket theo id — started_at là của server.

Nếu chưa kịp làm pool, tối thiểu phải vá ngay:
const MAX_SYNC_BATCH = 25;
const MAX_OFFLINE_AGE_MS = 7 * 24 * 3600_000;

if (rounds.length > MAX_SYNC_BATCH)
  return c.json({ error: "Too many rounds in one batch" }, 413);

// hạn ngạch mỗi ngày, chống farm
const { data: quotaOk } = await adminClient.rpc("consume_offline_quota", {
  p_user_id: user.id, p_count: rounds.length, p_daily_limit: 40,
});
if (!quotaOk) return c.json({ error: "Offline sync quota exceeded" }, 429);

// trong vòng lặp:
const startedMs = Date.parse(startedAt ?? "");
if (!Number.isFinite(startedMs) ||
    startedMs > Date.now() + 60_000 ||           // không cho thời gian tương lai
    Date.now() - startedMs > MAX_OFFLINE_AGE_MS) {
  results.push({ clientRoundId, status: "rejected", error: "Stale or invalid startedAt" });
  continue;
}
// kẹp elapsed vào khoảng hợp lý thay vì tin tuyệt đối
const elapsed = Math.min(Math.max(Number(clientElapsedMs) || 0, 500), 2 * 3600_000);

Và idempotency phải khoá theo clientRoundId, không phải started_at:
ALTER TABLE round_tickets ADD COLUMN client_round_id uuid;
CREATE UNIQUE INDEX round_tickets_client_round_uniq
  ON round_tickets (user_id, client_round_id) WHERE client_round_id IS NOT NULL;

Đồng thời đổi .single() → .maybeSingle() (hiện .single() ném lỗi PGRST116 khi 0 dòng — bạn đang nuốt lỗi nên may mắn chạy đúng, nhưng nó cũng ném khi có nhiều dòng).
Cuối cùng: nên giảm giá trị ván offline (vd. XP × 0.5, hoặc không tính vào bảng xếp hạng) — đó là cách các sản phẩm cạnh tranh xử lý dữ liệu không xác minh được.
Đ2. Một ván hỏng làm chết vĩnh viễn cả hàng đợi
scoreAndValidate ném exception khi serverElapsedMs < 500:
throw new Error("Round duration is invalid or expired");

Lời gọi này nằm trong vòng for nhưng chỉ có một try/catch bọc toàn bộ handler. Một ván có clientElapsedMs = 0 → cả batch trả 500 → syncOfflineQueue catch rồi throw → không xoá phần tử nào → lần sau lặp lại y hệt. Hàng đợi kẹt vĩnh viễn, retry vô hạn mỗi lần online.
for (const round of rounds) {
  try {
    
    results.push({ clientRoundId, status: "ok" });
  } catch (err) {
    logServerEvent({
      event: "offline_sync.round_failed", level: "warn",
      game: gameId, userId: user.id, requestId: requestIdFor(c.req.raw),
      message: err,
    });
    // "rejected" (không phải "error") để client DỌN khỏi hàng đợi
    results.push({ clientRoundId, status: "rejected", error: "Round could not be validated" });
  }
}

Nguyên tắc: mọi trạng thái cuối cùng phải dọn được hàng đợi; chỉ error do mạng mới được giữ lại.
Đ3. Rò rỉ listener trong use-offline-sync → gửi trùng lặp
useEffect(() => {
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline-queue-updated", () => {   // ❌ hàm ẩn danh
    if (navigator.onLine) void handleOnline();
  });
  return () => { window.removeEventListener("online", handleOnline); };
}, [isSyncing]);   // ❌ chạy lại mỗi lần isSyncing đổi

Effect phụ thuộc isSyncing, mà handleOnline lại setIsSyncing → effect chạy lại → cộng dồn thêm một listener offline-queue-updated không bao giờ gỡ. Sau 10 ván offline bạn có 20+ listener, mỗi lần push sẽ kích hoạt 20 lần sync song song. Guard if (isSyncing) vô dụng vì nó đọc giá trị đóng băng trong closure cũ.
export function useOfflineSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);          // mutex thật, không phụ thuộc render

  useEffect(() => {
    const refresh = () => setPendingCount(getOfflineQueue().length);

    const run = async () => {
      if (syncingRef.current || !navigator.onLine) return;
      if (getOfflineQueue().length === 0) return;
      syncingRef.current = true;
      setIsSyncing(true);
      try {
        await syncOfflineQueue(syncOfflineRounds);
        window.dispatchEvent(new Event("offline-sync-complete"));
      } catch (err) {
        logError("Auto sync failed:", err);   // ✅ dùng logger, không console
      } finally {
        syncingRef.current = false;
        setIsSyncing(false);
        refresh();
      }
    };

    const onQueueUpdated = () => { refresh(); void run(); };

    refresh();
    window.addEventListener("online", run);
    window.addEventListener("offline-queue-updated", onQueueUpdated);
    void run();

    return () => {
      window.removeEventListener("online", run);
      window.removeEventListener("offline-queue-updated", onQueueUpdated);
    };
  }, []);                                     // ✅ deps rỗng

  return { isSyncing, pendingCount };
}

Nên bổ sung backoff luỹ thừa (1s → 2s → 4s… tối đa 5 phút) để tránh bão request khi server 5xx.
Đ4. Race condition làm mất ván trong offline-queue.ts
const queue = getOfflineQueue();          // đọc
const response = await syncEndpoint(...); // ⏳ có thể mất vài giây
const newQueue = queue.filter(...);       // ❌ dùng snapshot CŨ
localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(newQueue));

Bất kỳ ván nào người chơi hoàn thành trong lúc đang await đều bị xoá sổ. Ngoài ra getOfflineQueue không kiểm tra kiểu → nếu localStorage bị hỏng thành object, queue.push ném lỗi và queue.length là undefined.
const MAX_QUEUE = 200;

function readQueue(): OfflineRoundPayload[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];      // ✅ chống dữ liệu hỏng
  } catch { return []; }
}

function writeQueue(q: OfflineRoundPayload[]): void {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  window.dispatchEvent(new Event("offline-queue-updated"));
}

export function pushOfflineRound(round: ...): boolean {
  try {
    const q = readQueue();
    if (q.length >= MAX_QUEUE) q.shift();            // ✅ FIFO, chống vỡ quota
    q.push({ ...round, clientRoundId: crypto.randomUUID(), schemaVersion: 1,
             createdAt: new Date().toISOString() });
    writeQueue(q);
    return true;
  } catch (err) { logError("Failed to push offline round:", err); return false; }
}

export async function syncOfflineQueue(syncEndpoint): Promise<SyncResult[]> {
  const batch = readQueue();
  if (batch.length === 0) return [];
  const { results = [] } = await syncEndpoint({ rounds: batch.slice(0, 25) });

  const settled = new Set(
    results.filter(r => r.status !== "error").map(r => r.clientRoundId)
  );
  // ✅ đọc LẠI ngay trước khi ghi, chỉ trừ đi những gì đã chốt
  writeQueue(readQueue().filter(i => !settled.has(i.clientRoundId)));
  return results;
}

Thêm: trả results ra ngoài để UI báo cho người chơi biết ván nào bị rejected (hiện đang xoá âm thầm — người chơi tưởng đã lưu).
Đ5. Cache profile chung một key → lộ dữ liệu giữa các tài khoản
export const CACHED_PROFILE_KEY = "mindgem.cached_profile";   // ❌ không gắn user

Kịch bản: A đăng nhập trên máy chung → cache profile A. A đăng xuất bằng cách đóng tab (không gọi onLogout). B đăng nhập, fetchProfile() gặp lỗi mạng → code fallback đọc cache → B thấy toàn bộ hồ sơ, XP, huy hiệu của A, và setProfile sẽ ghi đè cache đó bằng chính nó.
type CachedProfile = { userId: string; profile: Profile; at: string };
const CACHE_TTL_MS = 7 * 24 * 3600_000;

// khi ghi
localStorage.setItem(CACHED_PROFILE_KEY,
  JSON.stringify({ userId: p.id, profile: p, at: new Date().toISOString() }));

// khi đọc — BẮT BUỘC đối chiếu với user của session hiện tại
const { data: { user } } = await getSupabase().auth.getUser();
const cached = JSON.parse(localStorage.getItem(CACHED_PROFILE_KEY) ?? "null") as CachedProfile | null;
if (cached?.userId === user?.id && Date.now() - Date.parse(cached.at) < CACHE_TTL_MS) {
  setProfile(cached.profile);
}

Áp dụng đúng nguyên tắc này cho cả neurobics_offline_queue — hàng đợi offline của A hiện cũng sẽ được đồng bộ vào tài khoản B. Đây là lỗi tính điểm sai người, nghiêm trọng không kém.
 P1 — Bảo mật & luồng lỗi
Đ6. Recovery: khoá tài khoản vĩnh viễn + không thu hồi session
await adminClient.auth.admin.updateUserById(prof.id, { password: newPassword });
await adminClient.from("account_recovery").delete().eq("user_id", prof.id);   // ❌

Hai vấn đề nghiêm trọng:
Xoá mã mà không cấp mã mới. Vì không có email thật (@mindgem.local), sau lần khôi phục đầu tiên tài khoản mất khả năng khôi phục vĩnh viễn. Quên mật khẩu lần hai = mất tài khoản.
Không thu hồi session cũ. Kẻ tấn công đã chiếm được refresh token vẫn giữ quyền truy cập sau khi nạn nhân đổi mật khẩu — đúng kịch bản mà recovery sinh ra để ngăn.
const { error: upErr } = await adminClient.auth.admin.updateUserById(
  prof.id, { password: String(newPassword) },
);
if (upErr) throw upErr;

// ✅ đá mọi phiên đang mở
await adminClient.auth.admin.signOut(prof.id, "global");

// ✅ xoay mã mới, trả về đúng một lần
const nextCode = mintRecoveryCode();
await adminClient.from("account_recovery").upsert({
  user_id: prof.id,
  code_hash: await recoveryHmac(normalized, nextCode),
  created_at: new Date().toISOString(),
});
return c.json({ ok: true, recoveryCode: nextCode });

Đ7. TOCTOU trong rate-limit signup
Bạn check_signup_rate_limit (chỉ hỏi) rồi mới record_signup_attempt sau khi qua captcha. Giữa hai bước, N request đồng thời đều thấy "còn lượt" → vượt trần. Trớ trêu là hàm consumeRateLimit nguyên tử đã tồn tại và đang được dùng ở route recovery. Hãy dùng nó cho signup luôn: đặt một consumeRateLimit nhẹ ở đầu (chống flood), và một counter thứ hai chặt hơn tính theo số tài khoản tạo thành công.
Đ8. So sánh hash
if (candidate !== rec.code_hash && candidateRaw !== rec.code_hash && ...)

!== trên chuỗi thoát sớm ở byte đầu khác nhau → về lý thuyết đo được. Dùng so sánh hằng-thời-gian:
const eq = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

Quan trọng hơn: 4 biến thể legacy dùng SHA-256 không khoá. Nếu backup DB rò rỉ, kẻ tấn công brute-force offline được (không cần secret HMAC). Hãy tự động nâng cấp: khi khớp một hash legacy, ghi đè ngay bằng recoveryHmac và đặt hạn chót gỡ bỏ nhánh legacy. Ngoài ra việc chấp nhận cả codeUpper lẫn codeRaw cho thấy mã không phân biệt hoa/thường — hãy đảm bảo entropy ≥ 128 bit sau khi tính đến điều đó (vd. Base32 Crockford 26 ký tự).
Đ9. Không có audit log cho admin
admin-grant có thể set trục = 1000 và XP = 199.900.000 cho bất kỳ ai, admin-delete-user xoá vĩnh viễn — không để lại dấu vết nào. Bạn vừa xây observability_events, hãy dùng nó:
logServerEvent({
  event: "admin.grant", level: "warn", persist: true,
  userId: user.id, requestId: requestIdFor(c.req.raw),
  context: { targetId, mode, axes, xp, actor: user.id },
});

Tốt hơn nữa là bảng admin_audit riêng (append-only, RLS chỉ service_role) vì observability_events có thể bị xoay vòng/xoá theo TTL.
Đ10. Lỗi validation bị map thành 401
if (lower.includes("expired")) status = 401;

scoreAndValidate ném "Round duration is invalid or expired" → khớp chuỗi "expired" → trả 401 Unauthorized. Client rất dễ hiểu nhầm là hết phiên và đăng xuất người chơi giữa ván. Đây là hệ quả điển hình của việc phân loại lỗi bằng regex trên thông điệp.
export class AppError extends Error {
  constructor(message: string, readonly status: 400|401|409|410|422, readonly code: string) {
    super(message);
  }
}
// scoreAndValidate:
throw new AppError("Round duration is invalid or expired", 422, "invalid_duration");
// handler:
catch (err) {
  if (err instanceof AppError) return c.json({ error: err.message, code: err.code }, err.status);
  logServerEvent({ event: "submit_round.unhandled", level: "error", message: err, ... });
  return c.json({ error: "Round could not be saved." }, 500);
}

Áp dụng cùng cách cho start-round — hiện mọi lỗi (kể cả lỗi DB) đều trả 401.
Đ11. Anti-cheat oracle
return c.json({ error: "...", code: "anticheat_hard", flags: hard.map(f => f.msg) }, 422);
// và ở đường thành công:
cheatFlags: cheat.flags.map(f => ({ msg: f.msg, severity: f.severity })),

Bạn đã rất cẩn thận đốt ticket trước khi trả 422 để tránh biến anti-cheat thành oracle thử-lại — rồi lại trả về tên chính xác của detector đã kích hoạt ("Reaction faster than human floor", "Reaction timing too metronomic"). Kẻ gian chỉ cần vài lần thử là biết đúng ngưỡng để lách. Chỉ trả code chung chung; giữ chi tiết trong observability_events.
Đ12 & Đ13. Hai lỗi UX làm mất ván của người chơi
Đ12 — Hai regex không khớp nhau:
// completeRound — CÓ "round rejected"
/already submitted|expired|ticket not found|round rejected/i
// submitTelemetry — THIẾU "round rejected"
/already submitted|expired|ticket not found/i

Sau 422, ticketGone = false → hiện toast "Gửi lại" trong 15 giây. Nhưng server đã đốt ticket → mọi lần bấm đều nhận 404. Hãy dùng err.code === "anticheat_hard" và hiển thị thông điệp riêng, không kèm nút retry.
Đ13 — pushOfflineRound trả boolean nhưng bị bỏ qua ở cả hai chỗ gọi:
pushOfflineRound({ ... });                       // ❌ không kiểm tra
const result = completeLocalRound(current!, ...); // và hiện overlay "thành công"

Khi localStorage đầy, ván bị mất nhưng người chơi vẫn thấy màn hình kết quả. Phải kiểm tra giá trị trả về và cảnh báo. Đồng thời current! là non-null assertion không an toàn — nếu profileRef.current là null (khôi phục session lỗi) thì crash runtime.
Ghi chú thêm: fingerprint: "offline" chỉ dài 7 ký tự nên server bỏ qua (length >= 8), còn "offline-fallback" thì không bao giờ được endpoint sync đọc tới. Field này đang là dead code — và có vẻ submitRound(roundId, game, telemetry) cũng không truyền fingerprint thật, nên link_device gần như không bao giờ chạy. Cần kiểm tra lại api/rounds.ts.
 P2 — Anti-cheat & mô hình điểm
Đ14. inspectMemory: hard-reject người chơi nhanh ở cấp 1
const per = timeMs / cleared;
if (per < 600) return [flag("Memory pace impossibly fast", "hard", ...)];

Với cleared = 1, per chính là toàn bộ pha recall của cấp 1 — thường chỉ 3 ô. Ba lần chạm ở 180ms = 540ms → hard reject một ván hoàn toàn hợp lệ. Đây đúng là loại "bắt oan" mà file tuyên bố muốn tránh.
if (cleared < 3) return [];                     // quá ít dữ liệu để kết luận
const taps = Number(t?.totalTaps);              // chuẩn hoá theo SỐ Ô, không theo CẤP
const perTap = Number.isFinite(taps) && taps > 0 ? timeMs / taps : timeMs / cleared / 3;
if (perTap < 90) return [flag("Memory pace impossibly fast", "hard", { perTap })];

Đ15. inspectReaction: một mẫu duy nhất đủ để huỷ ván
if (min < HUMAN_FLOOR_MS) out.push(flag(..., "hard", { min }));

Comment của inspectSubThreshold nói rõ mẫu bất thường nên bị loại khỏi thống kê, không huỷ ván. Nhưng min vẫn hard-reject: một cú bấm đoán trước ở 79ms trong 20 lượt hợp lệ = mất streak + quest. Nên chuyển sang tỉ lệ:
const below = rts.filter(r => r < HUMAN_FLOOR_MS);
if (below.length >= 3 || below.length / rts.length >= 0.25)
  out.push(flag("Multiple reactions below human floor", "hard", { below: below.length, total: rts.length }));
else if (below.length > 0)
  out.push(flag("Isolated sub-floor reaction", "soft", { min }));

Đ16. inspectSearch mâu thuẫn với triết lý của chính file
Đây là inspector duy nhất dùng hard cho CV, dùng prefix "search: " khác kiểu, và có magic number score > 120 không giải thích. Trong khi stroop/nback/math với cùng mẫu metronomic chỉ nhận soft. Một người chơi nhịp đều ở search bị 422, ở stroop thì không — không nhất quán và dễ oan. Hãy hạ cả hai xuống soft, và thay score > 120 bằng một hằng số đặt tên có nguồn gốc rõ ràng (hoặc kẹp điểm ở tầng scoring).
Đ17. inspectSubThreshold chỉ đọc t.rts
Schulte dùng hitRts, Sudoku dùng moveRts → hàm này không chạy cho hai game đó. Nên truyền mảng RT chính xác theo game:
const RT_FIELD: Record<Game, string> = { schulte: "hitRts", sudoku: "moveRts", /* còn lại */ rts };

Liên quan: assertRtBounds cũng chỉ nhận telemetry.rts → hitRts/moveRts không được kiểm tra biên. Và submit-round không giới hạn kích thước body (route telemetry có 32KB, route này thì không) — một mảng 100.000 phần tử sẽ đốt CPU của Edge Function.
Đ18. MIN_POPULATION là hằng số chết
provisional: pop.n < MIN_POPULATION,   // chỉ dùng để gắn nhãn, không hề fallback

calcBrainAge vẫn xếp hạng người chơi ngay cả khi pop.n = 3. Với n nhỏ, sd có thể chỉ còn 5 → percentileOf bão hoà về 0 hoặc 1 → tuổi não nhảy ±12 năm ngẫu nhiên. Guard sd > 1 ? sd : 1 không cứu được trường hợp này.
export function blendPopulation(pop: PopulationStats): PopulationStats {
  if (pop.n >= MIN_POPULATION * 4) return pop;
  // Shrinkage kiểu Bayes: mẫu càng nhỏ càng nghiêng về phân phối mồi.
  const w = clamp01(pop.n / (MIN_POPULATION * 4));
  return {
    mean: w * pop.mean + (1 - w) * DEFAULT_POPULATION.mean,
    sd:   Math.max(60, w * pop.sd + (1 - w) * DEFAULT_POPULATION.sd),
    n: pop.n,
  };
}
// calcBrainAge: const p = blendPopulation(pop);

Sàn sd ≥ 60 quan trọng: nó ngăn tuổi não giật nảy khi cộng đồng còn nhỏ. Cũng nên loại chính người chơi khỏi mẫu (self-inclusion bias) khi n < 50.
Đ19. decayRating xói mòn nếu được ghi lại
return clampRating(Math.max(decayed, v * DECAY_FLOOR_RATIO));

Comment nói sàn là "35% of peak", nhưng công thức lấy 35% của v — tức giá trị hiện tại. Nếu hàm này từng được áp dụng rồi ghi ngược vào DB (cron đêm, hoặc đọc-decay-ghi), sàn tụt theo mỗi lần → tiệm cận 0 chứ không dừng ở 35%.
Chỉ an toàn khi nó là phép chiếu read-only từ giá trị chưa decay. Hãy làm điều đó thành bất biến của hệ thống: lưu peak_<axis> + last_active_date, luôn tính decayRating(peak, daysSince(last_active)) lúc đọc, không bao giờ ghi giá trị đã decay. Hiện applyAxes phía client dùng prev thô không decay, nên nếu server có decay thì preview và giá trị thật sẽ lệch — cần xác định rõ decay sống ở đúng một nơi.
Đ20. Có hai bộ chấm điểm dù file tuyên bố chỉ có một
scoring.ts viết hoa dòng chữ "KHÔNG nhân đôi công thức ở đây", nhưng completeLocalRound (từ ./guest) đang chấm điểm phía client cho cả người chơi đã đăng nhập khi offline. Kết quả: người chơi thấy điểm X, sync xong refreshProfile() ghi đè bằng điểm Y của server → con số nhảy trước mắt người dùng mà không giải thích gì.
Hai lựa chọn tốt, chọn một:
(Khuyến nghị) Đánh dấu kết quả offline là tạm tính trên overlay ("Sẽ xác nhận khi có mạng"), và không cập nhật trục/XP thật cho tới khi sync xong.
Hoặc trích công thức ra _shared/scoring/ thật sự dùng chung cho cả hai phía (khó hơn vì đây là Deno ↔ Vite).
Đ21. calculateRoundXp gần như phẳng
return Math.min(35, 15 + Math.floor(score / 50));   // 0 điểm → 15 XP, 1000 điểm → 35 XP

Chênh lệch chỉ 2,3 lần. Chiến lược tối ưu để lên cấp là spam ván dễ nhất, ngắn nhất — hoàn toàn ngược với mục tiêu huấn luyện nhận thức. Nếu cố ý (XP = engagement, rating = skill) thì ổn, nhưng nên cân nhắc đường cong lồi cộng lợi tức giảm dần theo game trong ngày:
export function calculateRoundXp(score: number, roundIndexForGameToday = 0): number {
  const s = clamp01(Math.max(0, Math.min(1000, score)) / 1000);
  const base = 8 + Math.round(27 * s ** 1.5);              // 8 → 35, thưởng nỗ lực
  const fatigue = Math.max(0.35, 1 - 0.15 * roundIndexForGameToday);
  return Math.max(4, Math.round(base * fatigue));
}

 P3 — Nhất quán & bảo trì
Đ22. Bảng cột trục bị nhân đôi. src/app/lib/axes.ts và routes/admin.ts khai báo cùng một map, chỉ nối với nhau bằng comment // Khop src/app/lib/axes.ts. Đổi tên cột ở một nơi = admin ghi sai cột âm thầm. Tương tự Math.min(1000, ...) trong admin thay vì RATING_MAX. Hãy đưa vào supabase/functions/_shared/axes.ts và để client import từ đó (hoặc sinh code từ migration).
Đ23. Danh mục game lệch nhau. Server có 12 game (schulte, sudoku, stroop, reaction, memory, nback, math, gonogo, mental, corsi, trail, search). Nhưng:
Badge all_games ghi "Chơi đủ 9 trò" / "Play all 9 games" → sai text hiển thị.
Không có badge per-game cho corsi, trail, search.
QUEST_GAME_NAMES thiếu search → q_play_search_2 sẽ render thô là "chơi search 2 ván".
all_games_10 / all_games_600 phụ thuộc định nghĩa "mọi game" của Postgres — nếu Postgres đếm 12 mà UI nói 9, người chơi sẽ nghĩ badge bị hỏng.
Sửa gốc: sinh cả BADGES lẫn QUEST_GAME_NAMES từ GAME_REGISTRY, và thêm test expect(Object.keys(QUEST_GAME_NAMES)).toEqual(GAME_IDS).
Đ24. Observability mới chỉ được áp dụng ~10%. Bạn xây logServerEvent rất tốt nhưng toàn bộ auth.ts, account.ts, admin.ts, và phần lớn rounds.ts vẫn dùng console.log — tức vẫn không có request id, không đếm được, biến mất sau 24h. Đúng vấn đề module này sinh ra để giải quyết. Nên thêm ESLint rule no-console cho supabase/functions/** (trừ file observability). Tương tự phía client: offline-queue.ts và use-offline-sync.ts dùng console.error trực tiếp, bỏ qua logError.
Đ25. setEventSink đặt sai chỗ. Doc trong observability.ts nói "index.ts nạp vào", nhưng thực tế nó được gọi trong registerTelemetryRoutes. Nếu có entrypoint khác không đăng ký route telemetry, mọi sự kiện warn/error bị nuốt im lặng. Chuyển lời gọi lên index.ts.
Đ26. Ghi log fire-and-forget có thể bị huỷ. 
void adminClient.from("observability_events").insert(rows).then(...)

Trên Supabase Edge Functions, isolate có thể bị đóng ngay sau khi response trả về → promise chưa hoàn tất bị huỷ, log biến mất đúng vào lúc bạn cần nhất (lỗi 5xx). Dùng EdgeRuntime.waitUntil(promise) (hoặc c.executionCtx.waitUntil), và gộp nhiều row lại trước khi insert.
Đ27. requestIdFor(c.req.raw) trong rounds.ts sẽ trả null trừ khi có middleware gọi beginRequest trước. Route telemetry tự phòng vệ bằng ?? beginRequest(...), route rounds thì không. Cần xác nhận middleware tồn tại, nếu không thì x-request-id trong log anti-cheat luôn rỗng.
Đ28. Vài điểm nhỏ:
clearOfflineQueue không phát offline-queue-updated → pendingCount treo ở giá trị cũ.
schemaVersion: 1 được ghi nhưng server không bao giờ đọc — bẫy tương lai khi bạn đổi format telemetry.
use-pwa-install: detectStandalone() chạy mỗi lần render và không phản ứng khi display-mode thay đổi. Nên dùng useSyncExternalStore thay cho hack useState(0) (React 18 concurrent có thể tearing).
use-app-state: các effect async (fetchActivityStats, fetchPopulationStats, restore session) không có cờ huỷ → setState sau unmount và race khi đổi profile nhanh.
submitBirthYear chấp nhận year === thisYear (tuổi 0) và không có ngưỡng tuổi tối thiểu — cân nhắc COPPA/GDPR-K nếu có người dùng < 13.
account.ts không xoá account_recovery (admin route thì có) — không nhất quán, và trả err.message thô ra client.
api.ts dùng export * từ 8 module → dễ va chạm tên trong im lặng và cản tree-shaking.
Icon badge nback_deep (🕱️) hiển thị thành ô vuông trên nhiều nền tảng.
Thứ tự thực thi đề xuất
Tuần 1 (chặn phát hành): Đ1 (giới hạn batch + kẹp thời gian + quota), Đ2, Đ3, Đ4, Đ5.
Tuần 2: Đ6, Đ10, Đ11, Đ12, Đ13, Đ9.
Tuần 3: Đ14–17 (anti-cheat false positive), Đ18–19 (brain age + decay).
Nợ kỹ thuật liên tục: Đ22–28, và đặc biệt là pre-mint ticket pool — đây mới là lời giải kiến trúc đúng cho Đ1, biến offline từ lỗ hổng thành tính năng có thể xác minh.
Hai bài test tôi khuyên viết trước tiên vì chúng bắt được nhiều lỗi P0 nhất:
Property test cho applyRoundRating: với mọi (prev, round), kết quả phải đơn điệu theo round (tôi đã kiểm tra thủ công — snapBoundary của bạn xử lý đúng, hãy khoá nó lại bằng test).
Integration test cho syncOfflineQueue: đẩy một ván trong lúc đang sync, khẳng định nó vẫn còn trong hàng đợi sau đó (Đ4).

đây là đánh giá của AI bạn xem cái nào đúng và hợp lí thì làm hêts cho tôi
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-08-13T17:27:15+07:00.
</ADDITIONAL_METADATA>
### CẬP NHẬT GẦN NHẤT (PHASE 24-27)
- **Phase 26 (Security Definer Hardening):** Đã sửa `search_players` và `send_friend_request` với `SET search_path = ''`, thêm rate limiting (15/5m) và `search_visible` toggle.
- **Phase 27 (Session Versioning):** `profiles` nay lưu `rating_model_version` từ `submit_round_transaction`. `get_population_stats` tách tập người chơi theo version.
- **Export Data (CCPA/GDPR):** `/server/account/export` nay trả về thêm `user_achievements`, `user_quests`, `xp_events`, `friendships`.
- **Brand Fixes:** Xử lý toàn bộ lỗi find-replace. Domain hiện đang là `mindgem.local`. Các file MD được trả lại brand `MindGem`.
