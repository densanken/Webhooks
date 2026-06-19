import { assertEquals, assertRejects, assertThrows } from "@std/assert";

import {
  DiscordWebhookBodyValidationError,
  parseDiscordWebhookJsonRequest,
  validateDiscordWebhookBody,
} from "./webhook-body.ts";

Deno.test("validateDiscordWebhookBody は content メッセージを受け入れる", () => {
  const body = validateDiscordWebhookBody({ content: "hello" });

  assertEquals(body.content, "hello");
});

Deno.test("validateDiscordWebhookBody は空の JSON オブジェクトを拒否する", () => {
  const error = assertThrows(
    () => validateDiscordWebhookBody({}),
    DiscordWebhookBodyValidationError,
  );

  assertEquals(error.code, "empty_body");
  assertEquals(error.status, 400);
});

Deno.test("validateDiscordWebhookBody はスキーマ違反のボディを拒否する", () => {
  const error = assertThrows(
    () => validateDiscordWebhookBody({ content: 123 }),
    DiscordWebhookBodyValidationError,
  );

  assertEquals(error.code, "invalid_schema");
  assertEquals(error.status, 400);
  assertEquals(error.issues.length > 0, true);
});

Deno.test("validateDiscordWebhookBody は空のオブジェクトを含む embeds を拒否する", () => {
  const error = assertThrows(
    () => validateDiscordWebhookBody({ embeds: [{}] }),
    DiscordWebhookBodyValidationError,
  );

  assertEquals(error.code, "invalid_schema");
  assertEquals(error.status, 400);
});

Deno.test("validateDiscordWebhookBody は有効なオブジェクトと空のオブジェクトが混在する embeds を拒否する", () => {
  const error = assertThrows(
    () =>
      validateDiscordWebhookBody({
        embeds: [{ title: "hello" }, {}],
      }),
    DiscordWebhookBodyValidationError,
  );

  assertEquals(error.code, "invalid_schema");
  assertEquals(error.status, 400);
});

Deno.test("validateDiscordWebhookBody は空でないオブジェクトの embeds を受け入れる", () => {
  const body = validateDiscordWebhookBody({
    embeds: [{ title: "hello" }],
  });

  assertEquals((body as { embeds: unknown[] }).embeds.length, 1);
});

Deno.test("validateDiscordWebhookBody はマルチパートが必要な添付ファイルボディを拒否する", () => {
  const error = assertThrows(
    () =>
      validateDiscordWebhookBody({
        attachments: [{ id: 0, filename: "example.txt" }],
      }),
    DiscordWebhookBodyValidationError,
  );

  assertEquals(error.code, "multipart_not_supported");
  assertEquals(error.status, 400);
});

Deno.test("validateDiscordWebhookBody はマルチパートが必要な添付ファイル URL 参照を拒否する", () => {
  const error = assertThrows(
    () =>
      validateDiscordWebhookBody({
        embeds: [{ image: { url: "attachment://example.png" } }],
      }),
    DiscordWebhookBodyValidationError,
  );

  assertEquals(error.code, "multipart_not_supported");
  assertEquals(error.status, 400);
});

Deno.test("parseDiscordWebhookJsonRequest は JSON リクエストを受け入れる", async () => {
  const body = await parseDiscordWebhookJsonRequest(
    jsonRequest(JSON.stringify({ content: "hello" })),
  );

  assertEquals(body.content, "hello");
});

Deno.test("parseDiscordWebhookJsonRequest は構造化 JSON メディアタイプを拒否する", async () => {
  const error = await assertRejects(
    () =>
      parseDiscordWebhookJsonRequest(
        jsonRequest(JSON.stringify({ content: "hello" }), {
          "content-type": "application/vnd.discord.webhook+json",
        }),
      ),
    DiscordWebhookBodyValidationError,
  );

  assertEquals(error.code, "invalid_content_type");
  assertEquals(error.status, 415);
});

Deno.test("parseDiscordWebhookJsonRequest は Content-Type なしのリクエストを拒否する", async () => {
  const error = await assertRejects(
    () =>
      parseDiscordWebhookJsonRequest(
        jsonRequest(JSON.stringify({ content: "hello" }), {}),
      ),
    DiscordWebhookBodyValidationError,
  );

  assertEquals(error.code, "invalid_content_type");
  assertEquals(error.status, 415);
});

Deno.test("parseDiscordWebhookJsonRequest はパラメータ付きの JSON リクエストを受け入れる", async () => {
  const body = await parseDiscordWebhookJsonRequest(
    jsonRequest(JSON.stringify({ content: "hello" }), {
      "content-type": "application/json; charset=utf-8",
    }),
  );

  assertEquals(body.content, "hello");
});

Deno.test("parseDiscordWebhookJsonRequest は無効な JSON を拒否する", async () => {
  const error = await assertRejects(
    () => parseDiscordWebhookJsonRequest(jsonRequest("{")),
    DiscordWebhookBodyValidationError,
  );

  assertEquals(error.code, "invalid_json");
  assertEquals(error.status, 400);
});

Deno.test("parseDiscordWebhookJsonRequest は JSON 以外のリクエストを拒否する", async () => {
  const error = await assertRejects(
    () =>
      parseDiscordWebhookJsonRequest(
        jsonRequest("hello", { "content-type": "text/plain" }),
      ),
    DiscordWebhookBodyValidationError,
  );

  assertEquals(error.code, "invalid_content_type");
  assertEquals(error.status, 415);
});

Deno.test("parseDiscordWebhookJsonRequest はマルチパートリクエストを拒否する", async () => {
  const error = await assertRejects(
    () =>
      parseDiscordWebhookJsonRequest(
        jsonRequest("ignored", {
          "content-type": "multipart/form-data; boundary=abc",
        }),
      ),
    DiscordWebhookBodyValidationError,
  );

  assertEquals(error.code, "multipart_not_supported");
  assertEquals(error.status, 415);
});

const jsonRequest = (
  body: string,
  headers: HeadersInit = { "content-type": "application/json" },
): Request =>
  new Request("https://example.com/discord/webhooks", {
    body,
    headers,
    method: "POST",
  });
