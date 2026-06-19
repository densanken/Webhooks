import { assertEquals } from "@std/assert";

import { resolveDispatchPendingInput } from "./dispatcher.ts";

const envReader = (env: Record<string, string>) => (name: string) => env[name];

Deno.test("resolveDispatchPendingInput は DISPATCH_* 環境変数をディスパッチャー入力に変換する", () => {
  assertEquals(
    resolveDispatchPendingInput(envReader({
      DISPATCH_MAX_MESSAGES_PER_RUN: "25",
      DISPATCH_INTERVAL_MS: "500",
      DISPATCH_MAX_ATTEMPTS: "3",
    })),
    { limit: 25, sendIntervalMs: 500, maxAttempts: 3 },
  );
});

Deno.test("resolveDispatchPendingInput は未設定・空文字・無効な環境変数を無視する", () => {
  assertEquals(
    resolveDispatchPendingInput(envReader({
      DISPATCH_INTERVAL_MS: "   ",
      DISPATCH_MAX_ATTEMPTS: "-1",
    })),
    {},
  );
  assertEquals(
    resolveDispatchPendingInput(envReader({
      DISPATCH_MAX_MESSAGES_PER_RUN: "1.5",
      DISPATCH_INTERVAL_MS: "not-a-number",
    })),
    {},
  );
});

Deno.test("resolveDispatchPendingInput は上限と送信間隔だけ 0 を許容する", () => {
  assertEquals(
    resolveDispatchPendingInput(
      envReader({
        DISPATCH_MAX_MESSAGES_PER_RUN: "0",
        DISPATCH_INTERVAL_MS: "0",
        DISPATCH_MAX_ATTEMPTS: "0",
      }),
    ),
    { limit: 0, sendIntervalMs: 0 },
  );
});
