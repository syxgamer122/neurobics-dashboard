# Version Policy

Bốn constant version trong codebase kiem soat viec scoring, anti-cheat va telemetry
duoc ghi vao database. Moi khi thay doi logic, tang version tuong ung de co the
phan biet du lieu cu va moi — **khong bao gio re-score du lieu cu bang logic moi**.

---

## 1. Bốn version constant

| Constant | File | Giá trị hiện tại | Ý nghĩa |
| --- | --- | --- | --- |
| `SCORER_VERSIONS` | `supabase/functions/_shared/scoring/core.ts` | Map | Phiên bản công thức tính điểm cho từng game (vd: `schulte: 1`) |
| `INSPECTOR_VERSIONS` | `supabase/functions/_shared/anticheat.ts` | Map | Phiên bản luật anti-cheat: thresholds, tập luật kiểm tra cho từng game |
| `SHARED_INSPECTOR_VERSION` | `supabase/functions/_shared/anticheat.ts` | `1` | Phiên bản luật anti-cheat dùng chung cho tất cả các game |
| `TELEMETRY_SCHEMA_VERSION` | `supabase/functions/_shared/scoring/core.ts` | `1` | Phiên bản cấu trúc telemetry payload: fields, kiểu dữ liệu, shape |

### SCORER_VERSIONS (Per-scorer Versioning)

Bump version của TỪNG GAME CỤ THỂ khi thay doi bat ky thanh phan nao anh huong ket qua scoring cua rieng game do:

- Trong so cac cognitive axis (`focusW`, `memoryW`, `speedW`, ...)
- Logic clamping hoac normalize diem
- Difficulty multiplier hoac curve

**Quy tắc "Per-Scorer":** Them game moi chi khai bao version cho game do (`new_game: 1`). Khong bump version cua cac game cu neu khong doi logic, tranh viec cac game cu bi gan version moi khien viec phan tich "re-score" mat y nghia.

### INSPECTOR_VERSIONS[game]

Bump khi thay doi luat chong gian lan:

- Sua threshold cua inspector (`HUMAN_FLOOR_MS`, `ROBOT_CV`, …)
- Them luat inspector moi cho game cu hoac game moi
- Thay doi severity tu `soft` sang `hard` hoac nguoc lai

### TELEMETRY_SCHEMA_VERSION

Bump khi thay doi cau truc telemetry payload ma client gui len:

- Them field moi (vd: `hintCount`, `pauseDuration`)
- Xoa field cu
- Doi kieu du lieu cua field (vd: `string` → `number`)
- Doi ten field

---

## 2. Khi nao bump — bang tra nhanh

| Tinh huong | SCORER | INSPECTOR | TELEMETRY_SCHEMA | SHARED_INSPECTOR |
| --- | --- | --- | --- | --- |
| Sửa logic inspectShared / inspectSubThreshold | — | — | — | ✅ bump |
| Them game moi | ✅ bump | ✅ bump | — | Không bump |
| Doi cong thuc scoring game co | ✅ bump | — | — | — |
| Doi threshold anti-cheat | — | ✅ bump | — | — |
| Them telemetry field anh huong scoring | ✅ bump | — | ✅ bump | — |
| Them telemetry field chi dung cho analytics | — | — | ✅ bump | — |
| Bug fix khong doi output | ❌ KHONG bump | ❌ KHONG bump | ❌ KHONG bump | ❌ KHONG bump |
| Refactor code, giu nguyen output | ❌ KHONG bump | ❌ KHONG bump | ❌ KHONG bump | ❌ KHONG bump |

> **Nguyen tac:** chi bump khi **ket qua quan sat duoc** (diem so, cheat flag, hoac
> shape cua payload) thay doi. Refactor noi bo khong bump.

---

## 3. Noi luu tru version

### 3.1 Source of truth — code constants

```typescript
// supabase/functions/_shared/scoring/core.ts
export const SCORER_VERSIONS: Record<string, number> = {
  schulte: 1,
  sudoku: 1,
  stroop: 1,
  reaction: 1,
  memory: 1,
  nback: 1,
  math: 1,
  gonogo: 1,
  mental: 1,
  corsi: 1,
  trail: 1,
  search: 1,
};
export const TELEMETRY_SCHEMA_VERSION = 1;

// supabase/functions/_shared/anticheat.ts
export const INSPECTOR_VERSIONS: Record<string, number> = {
  schulte: 1, sudoku: 1, stroop: 1, reaction: 1, memory: 1, nback: 1,
  math: 1, gonogo: 1, mental: 1, corsi: 1, trail: 1, search: 1,
};
export const SHARED_INSPECTOR_VERSION = 1;
```

### 3.2 Database — `training_sessions`

Moi round duoc ghi vao bang `training_sessions` qua RPC `submit_round_transaction`.
RPC tu dong gan cac gia tri version tai thoi diem server xu ly:

| Column | Source |
| --- | --- |
| `scorer_version` | `SCORER_VERSIONS[game]` |
| `inspector_version` | `INSPECTOR_VERSIONS[game]` |
| `shared_inspector_version` | `SHARED_INSPECTOR_VERSION` |
| `schema_version` | `TELEMETRY_SCHEMA_VERSION` |

### 3.3 Offline sync — `sync-offline-rounds`

Khi client offline, round duoc luu vao queue cung voi `schemaVersion` tai thoi
diem choi. Khi online lai, `sync-offline-rounds` gui len kem `schemaVersion` cu —
server van dung version **hien tai** cua `SCORER_VERSIONS` va `INSPECTOR_VERSIONS[game]`
de score va inspect, nhung ghi nhan `schema_version` tu payload offline.

---

## 4. Backward compatibility contract

### 4.1 Du lieu cu KHONG BAO GIO duoc re-score

Round da ghi voi `scorer_version = N` se **khong bao gio** bi tinh lai bang
`scorer_version = N+1`. Ket qua da ghi la bat bien.

### 4.2 Re-scoring khi can thiet

Neu phat hien loi scoring nghiem trong can tinh lai, tao migration SQL:

```sql
-- 1. Danh dau cac session can re-score
UPDATE training_sessions
SET needs_rescore = true
WHERE scorer_version = 1
  AND game = 'schulte';

-- 2. Chay batch re-score rieng (script hoac Edge Function),
--    ghi ket qua moi voi scorer_version = 2
```

**Khong** dung cach ghi de truc tiep len du lieu cu ma khong danh dau.

### 4.3 Version mismatch khi offline sync

Chap nhan duoc. Round offline mang `schemaVersion` cua luc choi (co the la
version cu). Server inspect va score bang version hien tai, nhung ghi nhan
`schema_version` goc tu payload. Dieu nay cho phep truy van sau nay biet round
nao duoc gui tu client version cu.

---

## 5. Truy van du lieu theo version

```sql
-- Tim sessions duoc score boi mot version cu the
SELECT * FROM training_sessions WHERE scorer_version = 1;

-- Phan bo version trong he thong
SELECT game, scorer_version, inspector_version, count(*)
FROM training_sessions
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- Tim sessions offline (thong qua column provenance)
SELECT id, game, schema_version, provenance
FROM training_sessions
WHERE provenance = 'offline_sync';

-- So luong session theo tung version theo thoi gian
SELECT
  date_trunc('day', created_at) AS day,
  scorer_version,
  count(*)
FROM training_sessions
GROUP BY 1, 2
ORDER BY 1, 2;
```

---

## 6. Checklist truoc khi merge PR co thay doi version

- [ ] Da bump dung version constant (xem bang o muc 2)
- [ ] Da chay `pnpm run test:sim` — tat ca sim cases pass voi version moi
- [ ] Da chay `pnpm run typecheck` — khong loi kieu
- [ ] Neu them game moi: da lam day du checklist trong `docs/adding-a-game.md`
- [ ] PR description ghi ro: version cu → version moi, ly do bump
- [ ] Neu can re-score du lieu cu: da tao migration SQL rieng
