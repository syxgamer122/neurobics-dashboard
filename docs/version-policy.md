# Version Policy

Năm constant version trong codebase kiem soat viec scoring, anti-cheat va telemetry
duoc ghi vao database. Moi khi thay doi logic, tang version tuong ung de co the
phan biet du lieu cu va moi — **khong bao gio re-score du lieu cu bang logic moi**.

---

## 1. Bản kê khai Động cơ (Round Engine Manifest)

Để đảm bảo khả năng tái lập (reproducibility) tuyệt đối cho mỗi ván chơi (ngoại trừ offline practice), hệ thống sử dụng một `RoundEngineManifest` ghim chặt toàn bộ logic tạo ra kết quả.

```typescript
type RoundEngineManifest = DeepReadonly<{
  scorerVersion: number;
  gameInspectorVersion: number;
  sharedInspectorVersion: number;
  telemetrySchemaVersion: number;
  configVersion: number;

  ratingModelVersion: number;
  calibrationVersion: number;
  xpPolicyVersion: number;
  challengeGeneratorVersion: number;

  inspectorRuleSetHash: `sha256:${string}`;
  artifactSha256: `sha256:${string}`;
}>;
```
Mỗi ván chơi sẽ lưu trữ `engine_manifest_hash` trên `round_tickets` và `training_sessions`, đồng thời lưu trữ các version riêng lẻ dưới dạng cột để tối ưu hóa việc query. Calibration nếu luôn đóng gói cứng trong Scorer có thể gộp chung vào `scorerVersion`.

### Support Window (Offline & Migration)
Server hỗ trợ tương thích ngược (backward compatibility) thông qua hằng số khai báo tường minh bằng dữ liệu:
```typescript
export const SUPPORTED_TELEMETRY_VERSIONS = {
  schulte: new Set([3, 2, 1]),
  nback: new Set([2, 1]),
};
```
Quy định vòng đời dữ liệu cũ:
- **0–7 ngày**: practice recent, có capped reward.
- **8–30 ngày**: stale, không XP/quest/streak.
- **>30 ngày**: chuyển dead-letter, cho export/xóa, không xử lý tự động.
Runtime chỉ được loại bỏ implementation cũ khi:
- Không còn non-terminal ticket tham chiếu.
- Đã qua thời hạn support >30 ngày.
- Không còn client build được hỗ trợ cần adapter đó.

## 2. Khi nào bump – Bảng tra nhanh (Bump Matrix)

| Thay đổi | Hành động |
| --- | --- |
| Thêm game mới | Khởi tạo scorer/inspector/schema/config ở version 1 (Không bump game cũ) |
| Đổi công thức điểm | Bump scorer |
| Đổi cách cập rolling rating | Bump rating model |
| Đổi calibration | Bump calibration hoặc scorer (nếu đóng gói chung) |
| Đổi XP | Bump XP policy |
| Đổi challenge generation | Bump challenge generator |
| Đổi giá trị difficulty/targets/speed | Bump config |
| Đổi threshold hoặc severity | Bump inspector/policy và tạo rule-set hash mới |
| Refactor được chứng minh bit-identical | KHÔNG bump |

**Nguyên tắc:** Chỉ bump khi **kết quả quan sát được** (điểm số, cheat flag, shape của payload) thay đổi. Refactor nội bộ không bump.


---

## 3. Noi luu tru version

### 3.1 Source of truth — code constants

```typescript
// supabase/functions/_shared/scoring/core.ts
type Scorer = (telemetry: unknown, config: Readonly<GameConfig>) => ScoredRound;
type VersionRegistry<T> = Readonly<Partial<Record<number, T>>>;

const registry = <T>(values: VersionRegistry<T>): VersionRegistry<T> => values;

export const SCORERS_BY_VERSION = {
  schulte: registry<Scorer>({ 1: scoreSchulteV1, 2: scoreSchulteV2 }),
  sudoku: registry<Scorer>({ 1: scoreSudokuV1 }),
  // Đầy đủ 12 game...
} satisfies Record<GameId, VersionRegistry<Scorer>>;

export const CURRENT_SCORER_VERSIONS = {
  schulte: 2,
  sudoku: 1,
  // ...
} as const satisfies Record<GameId, number>;

export function resolveScorer(game: GameId, version: number): Scorer {
  const scorer = SCORERS_BY_VERSION[game]?.[version];
  if (!scorer) throw new Error(`Unsupported scorer: ${game}@${version}`);
  return scorer;
}

// Tương tự cho các registry khác:
// CURRENT_INSPECTOR_VERSIONS / INSPECTORS_BY_VERSION
// CURRENT_SHARED_INSPECTOR_VERSION / SHARED_INSPECTORS_BY_VERSION
// CURRENT_TELEMETRY_SCHEMA_VERSIONS / SCHEMAS_BY_VERSION
// CURRENT_CONFIG_VERSIONS / CONFIGS_BY_VERSION
```

### 3.2 Database — `round_tickets`

Khi user bắt đầu ván chơi, server lưu đầy đủ các version này trực tiếp vào bảng `round_tickets`:

| Column | Source |
| --- | --- |
| `scorer_version` | `CURRENT_SCORER_VERSIONS[game]` |
| `inspector_version` | `CURRENT_INSPECTOR_VERSIONS[game]` |
| `shared_inspector_version` | `CURRENT_SHARED_INSPECTOR_VERSION` |
| `telemetry_schema_version` | `CURRENT_TELEMETRY_SCHEMA_VERSIONS[game]` |
| `config_version` | `CURRENT_CONFIG_VERSIONS[game]` |
| `inspector_rule_set_hash` | Hash bất biến của tập luật chống override runtime |

Khi submit round (cả online và offline), server luôn dùng các version đã được ghi sẵn trên `round_tickets` để score và inspect (thay vì version hiện tại của server). Điều này đảm bảo tính nhất quán tuyệt đối giữa challenge được giao và code chấm điểm.

Việc xoá code cũ (schema adapter, scorer cũ) chỉ được thực hiện khi hết TTL của ticket (không còn offline pending ticket sử dụng version đó).

### 3.3 Offline sync — `sync-offline-rounds`

Khi client offline, ván chơi được lưu vào queue. Khi online lại, `sync-offline-rounds` yêu cầu ticket thật từ server. Phiên bản được chốt vào ticket này (hoặc ticket cũ nếu vẫn còn telemetry_schema_version thuộc cửa sổ hỗ trợ). Server dùng chính version từ ticket để xử lý.

---

## 4. Backward compatibility contract

### 4.1 Du lieu cu KHONG BAO GIO duoc re-score

Round da ghi voi `scorer_version = N` se **khong bao gio** bi tinh lai bang
`scorer_version = N+1`. Ket qua da ghi la bat bien.

### 4.2 Xử lý sai sót (Never Re-score)

Session gốc luôn bất biến. Sai sót được xử lý bằng `manual_reviews` và append-only correction/compensation (như cấp bù XP hoặc reset flag thủ công). Không bao giờ được ghi đè điểm (score), `scorer_version` hoặc telemetry của session gốc.

### 4.3 Version mismatch khi offline sync

Chấp nhận được. Ticket offline được gán version tại thời điểm nó được đồng bộ lên (nếu không dùng ticket cũ). Code client/schemaAdapter phải tương thích backward 2 version telemetry schema. Server dùng chính version ghi trên ticket để chấm, lưu trữ `schema_version` gốc vào DB để truy vấn sau này.

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
FROM practice_sessions;

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
- [ ] Neu phat hien sai sot: da tao manual_review va compensation/correction append-only; khong thay doi session goc.
