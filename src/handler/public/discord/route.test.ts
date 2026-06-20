import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { DiscordRateLimitRepository } from "../../../repository/discord/rate-limit/impl.ts";
import { DiscordQueueRepository } from "../../../repository/discord/queue/impl.ts";
import { WebhookTokenRepository } from "../../../repository/token/impl.ts";
import { DiscordRegisteredWebhookRepository } from "../../../repository/discord/registered-webhook/impl.ts";
import {
  discordWebhookUrl,
  ENV_PERMISSION,
  withEncryptionKey,
  withMemoryKv,
} from "../../../test-helper/webhook.ts";
import type {
  DiscordSender,
  DiscordSendInput,
  DiscordSendResult,
} from "../../../usecase/discord/sender/interface.ts";
import { createDiscordWebhookRoute } from "./route.ts";

const REGISTERED_UUID = "registered-1";
const PATH_TOKEN = "path-token";
const DYNAMIC_TOKEN_UUID = "token-1";
const DYNAMIC_TOKEN = "b".repeat(43);

class MockDiscordSender implements DiscordSender {
  readonly calls: DiscordSendInput[] = [];

  constructor(private readonly result: DiscordSendResult) {}

  sendDiscordWebhook(
    input: DiscordSendInput,
  ): Promise<DiscordSendResult> {
    this.calls.push(input);
    return Promise.resolve(this.result);
  }
}

type AppContext = {
  app: Hono;
  kv: Deno.Kv;
  sender: MockDiscordSender;
  registeredHash: string;
};

const withApp = async (
  options: {
    senderResult?: DiscordSendResult;
    generateQueueMessageId?: () => string;
  },
  run: (context: AppContext) => Promise<void>,
): Promise<void> => {
  await withEncryptionKey(async () => {
    await withMemoryKv(async (kv) => {
      const registered = await new DiscordRegisteredWebhookRepository(kv)
        .createRegisteredDiscordWebhook({
          uuid: REGISTERED_UUID,
          discordWebhookUrl: discordWebhookUrl(),
          pathToken: PATH_TOKEN,
        });
      await new WebhookTokenRepository(kv).createDynamicWebhookToken({
        uuid: DYNAMIC_TOKEN_UUID,
        token: DYNAMIC_TOKEN,
      });

      const sender = new MockDiscordSender(
        options.senderResult ?? { ok: true },
      );
      const route = await createDiscordWebhookRoute({
        kv,
        sender,
        generateQueueMessageId: options.generateQueueMessageId ??
          (() => "message-1"),
      });
      const app = new Hono().route("/discord", route);

      await run({
        app,
        kv,
        sender,
        registeredHash: registered.discordWebhookUrlHash,
      });
    });
  });
};

const jsonHeaders = (headers: HeadersInit = {}): Headers => {
  const result = new Headers(headers);
  result.set("Content-Type", "application/json");
  return result;
};

const dynamicHeaders = (
  overrides: Record<string, string | null> = {},
): Headers => {
  const base: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${DYNAMIC_TOKEN}`,
    "X-Webhook-Token-Id": DYNAMIC_TOKEN_UUID,
    "X-Discord-Webhook-Url": discordWebhookUrl(),
  };
  const headers = new Headers(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      headers.delete(key);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
};

Deno.test({
  name: "登録済み Webhook は即時送信して 204 を返す",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({}, async ({ app, sender }) => {
      const response = await app.request(
        `/discord/webhooks/${REGISTERED_UUID}/${PATH_TOKEN}`,
        {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ content: "hello" }),
        },
      );

      assertEquals(response.status, 204);
      assertEquals(await response.text(), "");
      assertEquals(sender.calls, [{
        discordWebhookUrl: discordWebhookUrl(),
        body: { content: "hello" },
      }]);
    }),
});

Deno.test({
  name: "登録済み Webhook はブロック中の URL をキューに入れ 202 を返す",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({}, async ({ app, kv, sender, registeredHash }) => {
      await new DiscordRateLimitRepository(kv).setDiscordUrlRateLimit({
        discordWebhookUrlHash: registeredHash,
        blockedUntilEpochMs: Date.now() + 60_000,
        retryAfterMs: 60_000,
      });

      const response = await app.request(
        `/discord/webhooks/${REGISTERED_UUID}/${PATH_TOKEN}`,
        {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ content: "hello" }),
        },
      );

      assertEquals(response.status, 202);
      assertEquals(await response.json(), {
        status: "queued",
        reason: "blocked",
      });
      assertEquals(sender.calls, []);
    }),
});

Deno.test({
  name: "登録済み Webhook は不正なボディを 400 で拒否する",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({}, async ({ app }) => {
      const response = await app.request(
        `/discord/webhooks/${REGISTERED_UUID}/${PATH_TOKEN}`,
        {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({}),
        },
      );

      assertEquals(response.status, 400);
      assertEquals((await response.json()).code, "empty_body");
    }),
});

Deno.test({
  name: "登録済み Webhook は JSON 以外のコンテンツを 415 で拒否する",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({}, async ({ app }) => {
      const response = await app.request(
        `/discord/webhooks/${REGISTERED_UUID}/${PATH_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "content=hello",
        },
      );

      assertEquals(response.status, 415);
      assertEquals((await response.json()).code, "invalid_content_type");
    }),
});

Deno.test({
  name: "登録済み Webhook は無効なトークンを 401 で拒否する",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({}, async ({ app }) => {
      const response = await app.request(
        `/discord/webhooks/${REGISTERED_UUID}/wrong-token`,
        {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ content: "hello" }),
        },
      );

      assertEquals(response.status, 401);
      assertEquals((await response.json()).code, "unauthorized");
    }),
});

Deno.test({
  name: "登録済み Webhook は不明な UUID に対して 404 を返す",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({}, async ({ app }) => {
      const response = await app.request(
        `/discord/webhooks/unknown/${PATH_TOKEN}`,
        {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ content: "hello" }),
        },
      );

      assertEquals(response.status, 404);
      assertEquals((await response.json()).code, "not_found");
    }),
});

Deno.test({
  name: "Webhook は 429 以外の上流エラーで upstreamStatus を含む 502 を返す",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({
      senderResult: { ok: false, reason: "not_found", upstreamStatus: 404 },
    }, async ({ app, kv }) => {
      const response = await app.request(
        `/discord/webhooks/${REGISTERED_UUID}/${PATH_TOKEN}`,
        {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ content: "hello" }),
        },
      );

      assertEquals(response.status, 502);
      assertEquals(await response.json(), {
        error: "Discord webhook request failed",
        code: "upstream_error",
        upstreamStatus: 404,
      });
      // 429 以外の上流エラーはキューに入れない
      assertEquals(
        await new DiscordQueueRepository(kv)
          .scanPendingDiscordWebhookMessages(),
        [],
      );
    }),
});

Deno.test({
  name: "動的 Webhook は即時送信して 204 を返す",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({}, async ({ app, sender }) => {
      const response = await app.request("/discord/webhooks", {
        method: "POST",
        headers: dynamicHeaders(),
        body: JSON.stringify({ content: "hello" }),
      });

      assertEquals(response.status, 204);
      assertEquals(sender.calls, [{
        discordWebhookUrl: discordWebhookUrl(),
        body: { content: "hello" },
      }]);
    }),
});

Deno.test({
  name: "動的 Webhook は上流 429 でキューに入れ 202 を返す",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({
      senderResult: {
        ok: false,
        reason: "rate_limited",
        upstreamStatus: 429,
        retryAfterMs: 1_500,
      },
      generateQueueMessageId: () => "message-429",
    }, async ({ app, kv }) => {
      const response = await app.request("/discord/webhooks", {
        method: "POST",
        headers: dynamicHeaders(),
        body: JSON.stringify({ content: "hello" }),
      });

      assertEquals(response.status, 202);
      assertEquals(await response.json(), {
        status: "queued",
        reason: "rate_limited",
      });
      assertEquals(
        (await new DiscordQueueRepository(kv)
          .scanPendingDiscordWebhookMessages()).map((message) => message.id),
        ["message-429"],
      );
    }),
});

Deno.test({
  name: "動的 Webhook は認証情報なしのリクエストを 401 で拒否する",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({}, async ({ app }) => {
      const response = await app.request("/discord/webhooks", {
        method: "POST",
        headers: dynamicHeaders({ "Authorization": null }),
        body: JSON.stringify({ content: "hello" }),
      });

      assertEquals(response.status, 401);
      assertEquals((await response.json()).code, "unauthorized");
    }),
});

Deno.test({
  name: "動的 Webhook は無効なトークンを 401 で拒否する",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({}, async ({ app }) => {
      const response = await app.request("/discord/webhooks", {
        method: "POST",
        headers: dynamicHeaders({
          "Authorization": `Bearer ${"c".repeat(43)}`,
        }),
        body: JSON.stringify({ content: "hello" }),
      });

      assertEquals(response.status, 401);
      assertEquals((await response.json()).code, "unauthorized");
    }),
});

Deno.test({
  name: "動的 Webhook は無効な Discord URL を 400 で拒否する",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({}, async ({ app }) => {
      const response = await app.request("/discord/webhooks", {
        method: "POST",
        headers: dynamicHeaders({
          "X-Discord-Webhook-Url": "https://example.com/not-discord",
        }),
        body: JSON.stringify({ content: "hello" }),
      });

      assertEquals(response.status, 400);
      assertEquals((await response.json()).code, "invalid_discord_webhook_url");
    }),
});

Deno.test({
  name: "登録済み Webhook は過大なボディを 413 で拒否する",
  permissions: ENV_PERMISSION,
  fn: () =>
    withApp({}, async ({ app }) => {
      const oversizedBody = JSON.stringify({
        content: "x".repeat(2 * 1024 * 1024),
      });
      const response = await app.request(
        `/discord/webhooks/${REGISTERED_UUID}/${PATH_TOKEN}`,
        {
          method: "POST",
          headers: jsonHeaders(),
          body: oversizedBody,
        },
      );

      assertEquals(response.status, 413);
      assertEquals(await response.json(), {
        error: "Payload too large",
        code: "payload_too_large",
      });
    }),
});
