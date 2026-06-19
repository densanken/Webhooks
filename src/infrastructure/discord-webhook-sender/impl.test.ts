import { assertEquals, assertInstanceOf } from "@std/assert";

import {
  DiscordWebhookSender,
  type DiscordWebhookSenderOptions,
} from "./impl.ts";

Deno.test("DiscordWebhookSender sends JSON payloads to Discord webhook URLs", async () => {
  type Fetcher = NonNullable<DiscordWebhookSenderOptions["fetcher"]>;
  const calls: Array<{
    input: Parameters<Fetcher>[0];
    init: Parameters<Fetcher>[1];
  }> = [];
  const sender = new DiscordWebhookSender({
    fetcher: (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });

  const result = await sender.sendDiscordWebhook({
    discordWebhookUrl: "https://discord.com/api/webhooks/123/token",
    body: { content: "hello" },
  });

  assertEquals(result, { ok: true, status: 204 });
  assertEquals(calls.length, 1);
  const { signal, ...initWithoutSignal } = calls[0].init ?? {};
  assertInstanceOf(signal, AbortSignal);
  assertEquals(calls[0].input, "https://discord.com/api/webhooks/123/token");
  assertEquals(initWithoutSignal, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ content: "hello" }),
  });
});

Deno.test("DiscordWebhookSender は Discord のレート制限レスポンスを変換する", async () => {
  const sender = new DiscordWebhookSender({
    fetcher: () =>
      Promise.resolve(
        Response.json(
          { retry_after: 1.5 },
          {
            status: 429,
            headers: {
              "x-ratelimit-reset": "1781318401.25",
              "x-ratelimit-scope": "webhook",
              "x-ratelimit-bucket": "bucket-1",
            },
          },
        ),
      ),
  });

  const result = await sender.sendDiscordWebhook({
    discordWebhookUrl: "https://discord.com/api/webhooks/123/token",
    body: { content: "hello" },
  });

  assertEquals(result, {
    ok: false,
    reason: "rate_limited",
    upstreamStatus: 429,
    retryAfterMs: 1_500,
    blockedUntilEpochMs: 1_781_318_401_250,
    scope: "webhook",
    bucket: "bucket-1",
  });
});

Deno.test("DiscordWebhookSender は安全側のレート制限フォールバックを使用する", async () => {
  const sender = new DiscordWebhookSender({
    fetcher: () =>
      Promise.resolve(
        Response.json(
          { retry_after: -1 },
          { status: 429 },
        ),
      ),
  });

  const result = await sender.sendDiscordWebhook({
    discordWebhookUrl: "https://discord.com/api/webhooks/123/token",
    body: { content: "hello" },
  });

  assertEquals(result, {
    ok: false,
    reason: "rate_limited",
    upstreamStatus: 429,
    retryAfterMs: 60_000,
  });
});

Deno.test("DiscordWebhookSender は 2xx 以外の上流ステータスを変換する", async () => {
  const statuses = [
    [400, "bad_request"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [500, "server_error"],
    [418, "unknown"],
  ] as const;

  for (const [status, reason] of statuses) {
    const sender = new DiscordWebhookSender({
      fetcher: () => Promise.resolve(new Response(null, { status })),
    });

    assertEquals(
      await sender.sendDiscordWebhook({
        discordWebhookUrl: "https://discord.com/api/webhooks/123/token",
        body: { content: "hello" },
      }),
      {
        ok: false,
        reason,
        upstreamStatus: status,
      },
    );
  }
});
