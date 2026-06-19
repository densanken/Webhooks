import { assertEquals } from "@std/assert";

import {
  isActiveRateLimit,
  toBlockedUntilEpochMs,
  toSafeRetryAfterMs,
} from "./rate-limit.ts";

Deno.test("isActiveRateLimit は blockedUntil が未来の場合に true を返す", () => {
  const now = new Date("2026-06-16T00:00:00Z");
  assertEquals(isActiveRateLimit(now.getTime() + 1000, now), true);
  assertEquals(isActiveRateLimit(now.getTime(), now), false);
  assertEquals(isActiveRateLimit(now.getTime() - 1, now), false);
});

Deno.test("toSafeRetryAfterMs は無効な値を 0 に丸める", () => {
  assertEquals(toSafeRetryAfterMs(5000), 5000);
  assertEquals(toSafeRetryAfterMs(1.7), 1);
  assertEquals(toSafeRetryAfterMs(0), 0);
  assertEquals(toSafeRetryAfterMs(-1), 0);
  assertEquals(toSafeRetryAfterMs(NaN), 0);
  assertEquals(toSafeRetryAfterMs(Infinity), 0);
});

Deno.test("toBlockedUntilEpochMs は相対と絶対の期限のうち遅い方を選択する", () => {
  const completedAt = new Date("2026-06-16T00:00:00Z");
  const base = completedAt.getTime();

  assertEquals(toBlockedUntilEpochMs(completedAt, 5000), base + 5000);
  assertEquals(
    toBlockedUntilEpochMs(completedAt, 5000, base + 10000),
    base + 10000,
  );
  assertEquals(
    toBlockedUntilEpochMs(completedAt, 5000, base + 1000),
    base + 5000,
  );
  assertEquals(toBlockedUntilEpochMs(completedAt, 0), base);
  assertEquals(toBlockedUntilEpochMs(completedAt, 0, undefined), base);
});
