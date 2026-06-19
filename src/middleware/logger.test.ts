import { assertEquals } from "@std/assert";

import { redactSecretsInLog } from "./logger.ts";

Deno.test("redactSecretsInLog は登録済み Webhook のパストークンを秘匿化する", () => {
  assertEquals(
    redactSecretsInLog(
      "<-- POST /discord/webhooks/uuid-1/super-secret-token",
    ),
    "<-- POST /discord/webhooks/uuid-1/<redacted>",
  );

  assertEquals(
    redactSecretsInLog(
      "--> POST /discord/webhooks/uuid-1/super-secret-token 204 1ms",
    ),
    "--> POST /discord/webhooks/uuid-1/<redacted> 204 1ms",
  );
});

Deno.test("redactSecretsInLog は秘密情報を含まないパスを変更しない", () => {
  assertEquals(
    redactSecretsInLog("<-- POST /discord/webhooks"),
    "<-- POST /discord/webhooks",
  );

  assertEquals(
    redactSecretsInLog("--> GET /api/discord/webhooks/uuid-1 200 1ms"),
    "--> GET /api/discord/webhooks/uuid-1 200 1ms",
  );
});
