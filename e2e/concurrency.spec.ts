import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";

test.describe("Concurrency & Idempotency", () => {
  test("should process only 1 request when 50 offline syncs are sent simultaneously", async ({
    request,
  }) => {
    // 1. Simulate authentication (Assume we have a way to get a token, or we use service role for testing)
    // For this test, we assume the API supports a mock user or we just test the endpoint response
    // Wait, since we are doing E2E, we need a real user or we can use the Supabase JS client.

    // Instead of full E2E setup, here is the skeleton for the concurrency test
    // 50 concurrent requests with the SAME clientRoundId
    const clientRoundId = randomUUID();
    const concurrentCount = 50;

    // Mock user token (in a real test we'd login or create a test user)
    const token = process.env.TEST_USER_TOKEN || "dummy";

    const requests = Array.from({ length: concurrentCount }).map(() => {
      return request.post("/api/sync/offline", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        data: {
          clientRoundId,
          game: "schulte",
          score: 100,
          axes: { speed: 100, focus: 100 },
          timeMs: 15000,
          startedAt: new Date().toISOString(),
        },
      });
    });

    const responses = await Promise.all(requests);

    // We expect exactly ONE response to be successful (e.g., 200 OK with status: 'ok')
    // The other 49 should be 409 Conflict, or 200 OK with status: 'duplicate' depending on the API design
    let successCount = 0;
    let duplicateCount = 0;

    for (const res of responses) {
      if (res.ok()) {
        const body = await res.json();
        if (body.status === "ok") successCount++;
        else if (body.status === "duplicate") duplicateCount++;
      } else if (res.status() === 409) {
        duplicateCount++;
      }
    }

    expect(successCount).toBe(1);
    expect(duplicateCount).toBe(concurrentCount - 1);
  });
});
