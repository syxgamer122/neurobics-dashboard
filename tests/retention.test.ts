import fs from "fs";
import { describe, it, expect } from "vitest";

describe("Retention Contract", () => {
  it("verifies that the guest retention cron matches the documentation", () => {
    // 1. Read documentation
    const dataRetentionDoc = fs.readFileSync("docs/data-retention.md", "utf8");
    expect(dataRetentionDoc).toContain("Xóa sau 30 ngày");

    // 2. Read the actual SQL cron function definition or the latest migration
    const sqlCode = fs.readFileSync("supabase/migrations/20260910000004_stats_epoch.sql", "utf8");
    
    // 3. Assert the interval is exactly 30 days as documented
    expect(sqlCode).toMatch(/p\.created_at < now\(\) - interval '30 days'/);
  });
});
