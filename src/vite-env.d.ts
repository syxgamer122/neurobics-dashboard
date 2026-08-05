/// <reference types="vite/client" />

// Khai bao tuong minh cac bien moi truong dung trong app.
//
// Muc dich: `import.meta.env` mac dinh cua Vite co index signature `any`, nen go
// sai ten bien (VITE_SUPABASE_KEY thay vi VITE_SUPABASE_ANON_KEY) khong bi bao
// loi — chi im lang thanh undefined roi vo o runtime. Khai bao o day de tsc bat
// duoc ngay tai may.
//
// Kieu la `string | undefined` chu khong phai `string`: bien co the thieu trong
// .env, va `strict` dang bat nen TS se buoc kiem tra truoc khi dung.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_ANON_KEY: string | undefined;
  readonly VITE_TURNSTILE_SITE_KEY: string | undefined;
  readonly VITE_TELEMETRY_ENDPOINT: string | undefined;
  readonly VITE_TELEMETRY_SAMPLE: string | undefined;
  readonly VITE_TELEMETRY_OFF: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
