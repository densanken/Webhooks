import { assertEquals, assertThrows } from "@std/assert";

import { parseDiscordWebhookUrl } from "./webhook-url.ts";

const VALID_DISCORD_WEBHOOK_ID = "12345678901234567";
const VALID_DISCORD_WEBHOOK_TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEF";

const webhookUrl = (
  host: "discord.com" | "discordapp.com" = "discord.com",
): string =>
  `https://${host}/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}/${VALID_DISCORD_WEBHOOK_TOKEN}`;

Deno.test("parseDiscordWebhookUrl は discord.com の Webhook URL を受け入れる", () => {
  assertEquals(parseDiscordWebhookUrl(webhookUrl()), {
    url: webhookUrl(),
    origin: "https://discord.com",
    host: "discord.com",
    webhookId: VALID_DISCORD_WEBHOOK_ID,
    webhookToken: VALID_DISCORD_WEBHOOK_TOKEN,
  });
});

Deno.test("parseDiscordWebhookUrl は discordapp.com の Webhook URL を受け入れる", () => {
  assertEquals(parseDiscordWebhookUrl(webhookUrl("discordapp.com")), {
    url: webhookUrl("discordapp.com"),
    origin: "https://discordapp.com",
    host: "discordapp.com",
    webhookId: VALID_DISCORD_WEBHOOK_ID,
    webhookToken: VALID_DISCORD_WEBHOOK_TOKEN,
  });
});

Deno.test("parseDiscordWebhookUrl はサポート外のホストを拒否する", () => {
  assertThrows(() =>
    parseDiscordWebhookUrl(
      `https://example.com/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}/${VALID_DISCORD_WEBHOOK_TOKEN}`,
    )
  );

  assertThrows(() =>
    parseDiscordWebhookUrl(
      `https://discord.com.example.com/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}/${VALID_DISCORD_WEBHOOK_TOKEN}`,
    )
  );
});

Deno.test("parseDiscordWebhookUrl はクエリ文字列を拒否する", () => {
  assertThrows(() => parseDiscordWebhookUrl(`${webhookUrl()}?wait=true`));
  assertThrows(() => parseDiscordWebhookUrl(`${webhookUrl()}?`));
});

Deno.test("parseDiscordWebhookUrl は不正なパスを拒否する", () => {
  assertThrows(() =>
    parseDiscordWebhookUrl(
      `https://discord.com/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}`,
    )
  );

  assertThrows(() =>
    parseDiscordWebhookUrl(
      `https://discord.com/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}/${VALID_DISCORD_WEBHOOK_TOKEN}/extra`,
    )
  );

  assertThrows(() =>
    parseDiscordWebhookUrl(
      `https://discord.com/api/v10/webhooks/${VALID_DISCORD_WEBHOOK_ID}/${VALID_DISCORD_WEBHOOK_TOKEN}`,
    )
  );
});

Deno.test("parseDiscordWebhookUrl は無効な Webhook ID とトークンを拒否する", () => {
  assertThrows(() =>
    parseDiscordWebhookUrl(
      `https://discord.com/api/webhooks/1234567890/${VALID_DISCORD_WEBHOOK_TOKEN}`,
    )
  );

  assertThrows(() =>
    parseDiscordWebhookUrl(
      `https://discord.com/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}/short-token`,
    )
  );

  assertThrows(() =>
    parseDiscordWebhookUrl(
      `https://discord.com/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}/${
        "x".repeat(257)
      }`,
    )
  );
});

Deno.test("parseDiscordWebhookUrl は無効な URL 形式を拒否する", () => {
  assertThrows(() => parseDiscordWebhookUrl("not-a-url"));
  assertThrows(() =>
    parseDiscordWebhookUrl(
      `http://discord.com/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}/${VALID_DISCORD_WEBHOOK_TOKEN}`,
    )
  );
  assertThrows(() =>
    parseDiscordWebhookUrl(
      `https://user:pass@discord.com/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}/${VALID_DISCORD_WEBHOOK_TOKEN}`,
    )
  );
  assertThrows(() => parseDiscordWebhookUrl(`${webhookUrl()}#fragment`));
  assertThrows(() => parseDiscordWebhookUrl(`${webhookUrl()}#`));
});
