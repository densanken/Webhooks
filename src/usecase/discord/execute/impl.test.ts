import { assertEquals, assertRejects } from "@std/assert";

import { MockDiscordQueueRepository } from "../../../repository/discord/queue/impl.mock.ts";
import { MockDiscordRateLimitRepository } from "../../../repository/discord/rate-limit/impl.mock.ts";
import { MockWebhookTokenRepository } from "../../../repository/token/impl.mock.ts";
import { MockDiscordRegisteredWebhookRepository } from "../../../repository/discord/registered-webhook/impl.mock.ts";
import {
  discordWebhookUrl,
  ENV_PERMISSION,
  withEncryptionKey,
} from "../../../test-helper/webhook.ts";
import {
  DiscordWebhookBodyValidationError,
} from "../../../util/discord/webhook-body.ts";
import type {
  DiscordSender,
  DiscordSendInput,
  DiscordSendResult,
} from "../sender/interface.ts";
import { UseCaseError } from "../../error/impl.ts";
import { DiscordExecuteUseCase } from "./impl.ts";

Deno.test({
  name: "DiscordExecuteUseCase は登録済み Webhook リクエストを即座に送信する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const registeredRepository = new MockDiscordRegisteredWebhookRepository();
      const queueRepository = new MockDiscordQueueRepository();
      const sender = new MockDiscordSender({ ok: true });
      const usecase = new DiscordExecuteUseCase({
        registeredRepository,
        tokenRepository: new MockWebhookTokenRepository(),
        queueRepository,
        rateLimitRepository: new MockDiscordRateLimitRepository(),
        sender,
      });

      await registeredRepository.createRegisteredDiscordWebhook({
        uuid: "registered-1",
        discordWebhookUrl: discordWebhookUrl(),
        pathToken: "path-token",
      });

      const result = await usecase.executeRegisteredDiscordWebhook({
        uuid: "registered-1",
        pathToken: "path-token",
        request: jsonRequest({ content: "hello" }),
      });

      assertEquals(result, { status: "sent", statusCode: 204 });
      assertEquals(sender.calls, [{
        discordWebhookUrl: discordWebhookUrl(),
        body: { content: "hello" },
      }]);
      assertEquals(
        await queueRepository.scanPendingDiscordWebhookMessages(),
        [],
      );
    });
  },
});

Deno.test({
  name:
    "DiscordExecuteUseCase はブロック中の URL に対する登録済みリクエストをキューに入れる",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const registeredRepository = new MockDiscordRegisteredWebhookRepository();
      const queueRepository = new MockDiscordQueueRepository();
      const rateLimitRepository = new MockDiscordRateLimitRepository();
      const sender = new MockDiscordSender({ ok: true });
      const usecase = new DiscordExecuteUseCase({
        registeredRepository,
        tokenRepository: new MockWebhookTokenRepository(),
        queueRepository,
        rateLimitRepository,
        sender,
        generateQueueMessageId: () => "message-1",
      });
      const now = new Date("2026-06-06T00:00:00.000Z");
      const record = await registeredRepository
        .createRegisteredDiscordWebhook({
          uuid: "registered-1",
          discordWebhookUrl: discordWebhookUrl(),
          pathToken: "path-token",
        });
      await rateLimitRepository.setDiscordUrlRateLimit({
        discordWebhookUrlHash: record.discordWebhookUrlHash,
        blockedUntilEpochMs: now.getTime() + 2_500,
        retryAfterMs: 2_500,
        now,
      });

      const result = await usecase.executeRegisteredDiscordWebhook({
        uuid: "registered-1",
        pathToken: "path-token",
        request: jsonRequest({ content: "hello" }),
        now,
      });

      assertEquals(result, {
        status: "queued",
        statusCode: 202,
        reason: "blocked",
        queuedMessageId: "message-1",
        blockedUntilEpochMs: now.getTime() + 2_500,
      });
      assertEquals(sender.calls, []);
      assertEquals(
        (await queueRepository.scanPendingDiscordWebhookMessages()).map((
          message,
        ) => ({
          id: message.id,
          sourceType: message.sourceType,
          sourceId: message.sourceId,
          body: message.body,
        })),
        [{
          id: "message-1",
          sourceType: "registered",
          sourceId: "registered-1",
          body: { content: "hello" },
        }],
      );
    });
  },
});

Deno.test({
  name:
    "DiscordExecuteUseCase は 429 のときレート制限状態を更新し動的リクエストをキューに入れる",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const tokenRepository = new MockWebhookTokenRepository();
      const queueRepository = new MockDiscordQueueRepository();
      const rateLimitRepository = new MockDiscordRateLimitRepository();
      const sender = new MockDiscordSender({
        ok: false,
        reason: "rate_limited",
        upstreamStatus: 429,
        retryAfterMs: 1_500,
        scope: "webhook",
        bucket: "bucket-1",
      });
      const usecase = new DiscordExecuteUseCase({
        registeredRepository: new MockDiscordRegisteredWebhookRepository(),
        tokenRepository,
        queueRepository,
        rateLimitRepository,
        sender,
        generateQueueMessageId: () => "message-429",
      });
      const now = new Date("2026-06-06T00:00:00.000Z");
      const token = "b".repeat(43);
      await tokenRepository.createDynamicWebhookToken({
        uuid: "token-1",
        token,
      });

      const result = await usecase.executeDynamicDiscordWebhook({
        request: jsonRequest({ content: "hello" }, {
          authorization: `Bearer ${token}`,
          "x-discord-webhook-url": discordWebhookUrl(),
          "x-webhook-token-id": "token-1",
        }),
        now,
      });

      assertEquals(result, {
        status: "queued",
        statusCode: 202,
        reason: "rate_limited",
        queuedMessageId: "message-429",
        blockedUntilEpochMs: now.getTime() + 1_500,
      });
      assertEquals(
        await rateLimitRepository.getDiscordUrlRateLimitForWebhookUrl(
          discordWebhookUrl(),
        ).then((record) =>
          record && {
            blockedUntilEpochMs: record.blockedUntilEpochMs,
            retryAfterMs: record.retryAfterMs,
            scope: record.scope,
            bucket: record.bucket,
          }
        ),
        {
          blockedUntilEpochMs: now.getTime() + 1_500,
          retryAfterMs: 1_500,
          scope: "webhook",
          bucket: "bucket-1",
        },
      );
      assertEquals(
        (await queueRepository.scanPendingDiscordWebhookMessages()).map((
          message,
        ) => ({
          id: message.id,
          sourceType: message.sourceType,
          sourceId: message.sourceId,
        })),
        [{
          id: "message-429",
          sourceType: "dynamic",
          sourceId: "token-1",
        }],
      );
      assertEquals(sender.calls.length, 1);
    });
  },
});

Deno.test({
  name:
    "DiscordExecuteUseCase は送信完了後にフォールバック用のレート制限期限を計算する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const tokenRepository = new MockWebhookTokenRepository();
      const queueRepository = new MockDiscordQueueRepository();
      const rateLimitRepository = new MockDiscordRateLimitRepository();
      const startedAt = new Date("2026-06-06T00:00:00.000Z");
      const completedAt = new Date("2026-06-06T00:00:05.000Z");
      const times = [startedAt, completedAt];
      const token = "b".repeat(43);
      const usecase = new DiscordExecuteUseCase({
        registeredRepository: new MockDiscordRegisteredWebhookRepository(),
        tokenRepository,
        queueRepository,
        rateLimitRepository,
        sender: new MockDiscordSender({
          ok: false,
          reason: "rate_limited",
          upstreamStatus: 429,
          retryAfterMs: 1_500,
          blockedUntilEpochMs: startedAt.getTime() - 1_000,
        }),
        generateQueueMessageId: () => "message-delayed-429",
        getNow: () => times.shift() ?? completedAt,
      });
      await tokenRepository.createDynamicWebhookToken({
        uuid: "token-1",
        token,
      });

      const result = await usecase.executeDynamicDiscordWebhook({
        request: jsonRequest({ content: "hello" }, {
          authorization: `Bearer ${token}`,
          "x-discord-webhook-url": discordWebhookUrl(),
          "x-webhook-token-id": "token-1",
        }),
      });

      assertEquals(result, {
        status: "queued",
        statusCode: 202,
        reason: "rate_limited",
        queuedMessageId: "message-delayed-429",
        blockedUntilEpochMs: completedAt.getTime() + 1_500,
      });
      assertEquals(
        await rateLimitRepository.getDiscordUrlRateLimitForWebhookUrl(
          discordWebhookUrl(),
        ).then((record) =>
          record && {
            blockedUntilEpochMs: record.blockedUntilEpochMs,
            updatedAt: record.updatedAt,
          }
        ),
        {
          blockedUntilEpochMs: completedAt.getTime() + 1_500,
          updatedAt: completedAt.toISOString(),
        },
      );
      assertEquals(
        await queueRepository.getDiscordWebhookMessage(
          "message-delayed-429",
        ).then((message) => message?.createdAt),
        completedAt.toISOString(),
      );
    });
  },
});

Deno.test({
  name: "DiscordExecuteUseCase は無効な登録済み Webhook トークンを拒否する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const registeredRepository = new MockDiscordRegisteredWebhookRepository();
      const sender = new MockDiscordSender({ ok: true });
      const usecase = new DiscordExecuteUseCase({
        registeredRepository,
        tokenRepository: new MockWebhookTokenRepository(),
        queueRepository: new MockDiscordQueueRepository(),
        rateLimitRepository: new MockDiscordRateLimitRepository(),
        sender,
      });
      await registeredRepository.createRegisteredDiscordWebhook({
        uuid: "registered-1",
        discordWebhookUrl: discordWebhookUrl(),
        pathToken: "path-token",
      });

      const error = await assertRejects(
        () =>
          usecase.executeRegisteredDiscordWebhook({
            uuid: "registered-1",
            pathToken: "wrong-token",
            request: jsonRequest({ content: "hello" }),
          }),
        UseCaseError,
      );

      assertEquals(error.code, "unauthorized");
      assertEquals(error.status, 401);

      const nullByteError = await assertRejects(
        () =>
          usecase.executeRegisteredDiscordWebhook({
            uuid: "registered-1",
            pathToken: "path-token\0",
            request: jsonRequest({ content: "hello" }),
          }),
        UseCaseError,
      );

      assertEquals(nullByteError.code, "unauthorized");
      assertEquals(nullByteError.status, 401);
      assertEquals(sender.calls, []);
    });
  },
});

Deno.test({
  name: "DiscordExecuteUseCase は公開 Webhook の JSON ボディを検証する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const registeredRepository = new MockDiscordRegisteredWebhookRepository();
      const sender = new MockDiscordSender({ ok: true });
      const usecase = new DiscordExecuteUseCase({
        registeredRepository,
        tokenRepository: new MockWebhookTokenRepository(),
        queueRepository: new MockDiscordQueueRepository(),
        rateLimitRepository: new MockDiscordRateLimitRepository(),
        sender,
      });
      await registeredRepository.createRegisteredDiscordWebhook({
        uuid: "registered-1",
        discordWebhookUrl: discordWebhookUrl(),
        pathToken: "path-token",
      });

      const error = await assertRejects(
        () =>
          usecase.executeRegisteredDiscordWebhook({
            uuid: "registered-1",
            pathToken: "path-token",
            request: jsonRequest({}),
          }),
        DiscordWebhookBodyValidationError,
      );

      assertEquals(error.code, "empty_body");
      assertEquals(sender.calls, []);
    });
  },
});

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

const jsonRequest = (
  body: unknown,
  headers: HeadersInit = {},
): Request =>
  new Request("https://example.com/discord/webhooks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
