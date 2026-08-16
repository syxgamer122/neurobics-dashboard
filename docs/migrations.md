# Migration tu dong

Truoc: moi thay doi schema duoc dan tay vao SQL Editor. Khong ai biet production
dang o phien ban nao, khong the tai lap moi truong, va mot cu dan sai la khong co
duong lui.

Sau: `supabase/migrations/` la nguon su that duy nhat. CI ap dung file, con
`pnpm run db:lint` chan cac loi kinh dien truoc khi chung cham vao database.

---

## 1. Van de phai xu ly mot lan duy nhat: baseline

Database that duoc dung tay, nen bang so `supabase_migrations.schema_migrations`
cua no rong hoac thieu. Neu chay `supabase db push` ngay luc nay, CLI coi ca 35
file la "chua ap dung" va chay lai tu dau. Trong so do co `drop column`,
`delete from`, `drop policy` => **mat du lieu that**.

Baseline la thao tac ghi vao so: "35 version nay coi nhu da ap dung roi".

```powershell
# 1. Chuan hoa ten file trung version (3 file 20260730_*)
node tools/normalize-migrations.mjs            # chi in ke hoach
node tools/normalize-migrations.mjs --apply    # doi ten that

# 2. Sinh danh sach version + cau SQL chot moc
pnpm run db:baseline
```

`db:baseline` tao 2 file:

| File | Vai tro |
| --- | --- |
| `supabase/baseline/applied-versions.txt` | `db:lint` doc de biet migration nao da ap dung |
| `supabase/baseline/mark-existing-as-applied.sql` | Dan **mot lan** vao SQL Editor cua production |

Cau SQL do chi `insert ... on conflict do nothing` vao bang so — khong sua bang
du lieu nao. Sau khi chay, kiem tra:

```powershell
pnpm run db:status     # supabase migration list --linked
```

Cot Local va Remote phai khop het. Nhung version chi co o Local nghia la baseline
chua ghi du — dung `db push` cho den khi khop.

---

## 2. Nhip lam viec hang ngay

```powershell
# Tao migration moi (timestamp 14 chu so, ten snake_case)
# vd: supabase/migrations/20260905120000_add_streak_bonus.sql

pnpm run db:lint     # kiem tra truoc khi commit
git add supabase/migrations && git commit -m "db: add streak bonus" && git push
```

Roi vao **Actions > Deploy Supabase > Run workflow**:

1. Lan dau: giu o `dry run` da tich — chi in ra migration se chay.
2. Doc log. Neu dung nhu mong doi, chay lai va **bo tich** `dry run`.
3. Khi da tin tuong, bo comment khoi `push:` trong
   `.github/workflows/deploy-supabase.yml` de deploy tu dong theo moi commit.

Workflow can 3 secrets trong **Settings > Secrets and variables > Actions**:

| Secret | Lay o dau |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | `<YOUR_PROJECT_REF>` (Phân chia theo GitHub Environment: tạo riêng cho `staging` và `production`) |
| `SUPABASE_DB_PASSWORD` | Settings > Database > Database password (Phân chia theo Environment) |

Thieu bat ky secret nao, workflow bao loi ro rang o buoc **Verify secrets** thay
vi that bai giua duong voi thong diep kho hieu.

---

## 3. `db:lint` chan nhung gi

Chay tu dong trong CI (`pnpm run check` va workflow CI).

| Muc | Ket qua | Ly do |
| --- | --- | --- |
| Ten file sai dinh dang `<version>_<ten>.sql` | **Loi** | CLI khong nhan ra |
| Hai file cung version | **Loi** | CLI chi ghi nhan mot ban, ban kia bi bo im lang |
| File rong | **Loi** | Gan nhu luon la sai sot |
| Version moi < version da ap dung | **Loi** | CLI se BO QUA file, ban tuong da chay |
| `drop table` / `truncate` / `drop column` / `drop schema` o file MOI | **Loi** | Mat du lieu khong phuc hoi duoc |
| Cung cau lenh do o file DA baseline | Canh bao | Da chay roi, sua cung vo nghia |
| `delete from` / `drop policy` | Canh bao | Rat pho bien, thuong nam trong than function |
| Thieu `if not exists` / `or replace` | Canh bao | Chay lai se loi |

Khi that su can cau lenh pha huy, them dong dau tien vao file:

```sql
-- allow-destructive: bo cot legacy_score, da migrate sang rating tu 20260812
```

Danh dau nay tat toan bo kiem tra pha huy cho rieng file do — nen phai ghi ly do
that, de nguoi doc sau hieu tai sao.

---

## 4. Bang lenh

| Lenh | Tac dung |
| --- | --- |
| `pnpm run db:lint` | Kiem tra migration (CI chay buoc nay) |
| `pnpm run db:normalize` | In ke hoach doi ten file trung version |
| `pnpm run db:baseline` | Sinh baseline tu danh sach file hien co |
| `pnpm run db:status` | So sanh Local vs Remote |
| `pnpm run db:push` | Ap dung migration tu may (thuong de CI lo) |
| `pnpm run functions:deploy` | Deploy Edge Function `server` |

---

## 5. Quy tac song con

1. **Khong bao gio sua mot migration da ap dung.** Viet file moi de sua tiep.
   File cu la lich su; sua no lam moi truong lech nhau khong the phat hien.
2. **Viet idempotent.** `create table if not exists`, `create or replace function`,
   `drop policy if exists` truoc `create policy`. Nho vay chay lai vo hai.
3. **Mot migration = mot y dinh.** De doc review va de khoanh vung khi co su co.
4. **Khong co rollback tu dong.** Postgres khong hoan tac DDL da commit. Muon lui
   thi viet migration moi lam nguoc lai — nen hay dry run truoc khi ap dung.
5. **Sao luu truoc thay doi lon.** Supabase Dashboard > Database > Backups.
