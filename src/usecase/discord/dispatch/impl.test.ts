import { assertEquals } from "@std/assert";

import { MockDiscordQueueRepository } from "../../../repository/discord/queue/impl.mock.ts";
import type {
  QueuedDiscordMessageRecord,
  UpdateQueuedDiscordMessageInput,
} from "../../../repository/discord/queue/interface.ts";
import { MockDiscordRateLimitRepository } from "../../../repository/discord/rate-limit/impl.mock.ts";
import {
  discordWebhookUrl,
  ENV_PERMISSION,
  VALID_DISCORD_WEBHOOK_ID,
  withEncryptionKey,
} from "../../../test-helper/webhook.ts";
import type {
  DiscordRateLimitRecord,
  ReserveDiscordRateLimitInput,
} from "../../../repository/discord/rate-limit/interface.ts";
import type {
  DiscordSender,
  DiscordSendInput,
  DiscordSendResult,
} from "../sender/interface.ts";
import { DiscordDispatchUseCase } from "./impl.ts";

Deno.test({
  name:
    "DiscordDispatchUseCase は保留中メッセージを送信し、ブロック中 URL をスキップし、最終的な失敗をデッドレターにする",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const queueRepository = new MockDiscordQueueRepository();
      const rateLimitRepository = new MockDiscordRateLimitRepository();
      const sender = new RoutingDiscordSender((input) => {
        const content = (input.body as { content?: string }).content;
        if (content === "dead") {
          return { ok: false, reason: "not_found", upstreamStatus: 404 };
        }

        return { ok: true };
      });
      const usecase = new DiscordDispatchUseCase({
        queueRepository,
        rateLimitRepository,
        sender,
        wait: () => Promise.resolve(),
      });
      const now = new Date("2026-06-06T00:00:05.000Z");
      const blockedUrl = discordWebhookUrl("discordapp.com");

      await queueRepository.enqueueDiscordWebhookMessage({
        id: "message-send",
        sourceType: "registered",
        sourceId: "registered-1",
        discordWebhookUrl: discordWebhookUrlWithToken("a".repeat(43)),
        body: { content: "send" },
        now: new Date("2026-06-06T00:00:00.000Z"),
      });
      await queueRepository.enqueueDiscordWebhookMessage({
        id: "message-skip",
        sourceType: "dynamic",
        sourceId: "token-1",
        discordWebhookUrl: blockedUrl,
        body: { content: "skip" },
        now: new Date("2026-06-06T00:00:01.000Z"),
      });
      await queueRepository.enqueueDiscordWebhookMessage({
        id: "message-dead",
        sourceType: "registered",
        sourceId: "registered-2",
        discordWebhookUrl: discordWebhookUrlWithToken("c".repeat(43)),
        body: { content: "dead" },
        now: new Date("2026-06-06T00:00:02.000Z"),
      });
      await rateLimitRepository.setDiscordUrlRateLimitForWebhookUrl({
        discordWebhookUrl: blockedUrl,
        blockedUntilEpochMs: now.getTime() + 5_000,
        retryAfterMs: 5_000,
        now,
      });

      const result = await usecase.dispatchPendingDiscordWebhookMessages({
        sendIntervalMs: 0,
        now,
      });

      assertEquals(result, {
        scanned: 3,
        sent: 1,
        skipped: 1,
        retried: 0,
        rateLimited: 0,
        dead: 1,
        deadMessages: [{
          id: "message-dead",
          sourceType: "registered",
          sourceId: "registered-2",
          attempts: 1,
          lastError: { reason: "not_found", upstreamStatus: 404 },
          body: { content: "dead" },
        }],
      });
      assertEquals(
        sender.calls.map((call) => (call.body as { content: string }).content),
        ["send", "dead"],
      );
      assertEquals(
        (await queueRepository.getDiscordWebhookMessage("message-send"))
          ?.status,
        "sent",
      );
      assertEquals(
        (await queueRepository.getDiscordWebhookMessage("message-skip"))
          ?.status,
        "pending",
      );
      assertEquals(
        (await queueRepository.getDiscordWebhookMessage("message-dead"))
          ?.status,
        "dead",
      );
    });
  },
});

Deno.test({
  name:
    "DiscordDispatchUseCase はレート制限状態を更新し 429 メッセージを保留のままにする",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const queueRepository = new MockDiscordQueueRepository();
      const rateLimitRepository = new MockDiscordRateLimitRepository();
      const sender = new RoutingDiscordSender(() => ({
        ok: false,
        reason: "rate_limited",
        upstreamStatus: 429,
        retryAfterMs: 2_500,
        blockedUntilEpochMs: new Date("2026-06-06T00:00:04.000Z").getTime(),
        scope: "webhook",
        bucket: "bucket-1",
      }));
      const usecase = new DiscordDispatchUseCase({
        queueRepository,
        rateLimitRepository,
        sender,
        wait: () => Promise.resolve(),
      });
      const now = new Date("2026-06-06T00:00:05.000Z");
      const url = discordWebhookUrlWithToken("d".repeat(43));

      await queueRepository.enqueueDiscordWebhookMessage({
        id: "message-429",
        sourceType: "dynamic",
        sourceId: "token-1",
        discordWebhookUrl: url,
        body: { content: "retry later" },
        now: new Date("2026-06-06T00:00:00.000Z"),
      });

      const result = await usecase.dispatchPendingDiscordWebhookMessages({
        sendIntervalMs: 0,
        now,
      });

      assertEquals(result, {
        scanned: 1,
        sent: 0,
        skipped: 0,
        retried: 1,
        rateLimited: 1,
        dead: 0,
        deadMessages: [],
      });
      assertEquals(
        await queueRepository.getDiscordWebhookMessage("message-429").then((
          message,
        ) =>
          message && {
            status: message.status,
            attempts: message.attempts,
            lastError: message.lastError,
          }
        ),
        {
          status: "pending",
          attempts: 0,
          lastError: { reason: "rate_limited", upstreamStatus: 429 },
        },
      );
      assertEquals(
        await rateLimitRepository.getDiscordUrlRateLimitForWebhookUrl(url).then(
          (record) =>
            record && {
              blockedUntilEpochMs: record.blockedUntilEpochMs,
              retryAfterMs: record.retryAfterMs,
              scope: record.scope,
              bucket: record.bucket,
            },
        ),
        {
          blockedUntilEpochMs: now.getTime() + 2_500,
          retryAfterMs: 2_500,
          scope: "webhook",
          bucket: "bucket-1",
        },
      );
    });
  },
});

Deno.test({
  name:
    "DiscordDispatchUseCase は送信上限を適用する前にブロック中メッセージの先までスキャンする",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const queueRepository = new MockDiscordQueueRepository();
      const rateLimitRepository = new MockDiscordRateLimitRepository();
      const sender = new RoutingDiscordSender(() => ({ ok: true }));
      const usecase = new DiscordDispatchUseCase({
        queueRepository,
        rateLimitRepository,
        sender,
        wait: () => Promise.resolve(),
      });
      const now = new Date("2026-06-06T00:00:05.000Z");
      const blockedUrl = discordWebhookUrlWithToken("a".repeat(43));
      const unblockedUrl = discordWebhookUrlWithToken("b".repeat(43));

      for (let index = 0; index < 50; index += 1) {
        await queueRepository.enqueueDiscordWebhookMessage({
          id: `message-blocked-${index}`,
          sourceType: "registered",
          sourceId: "registered-blocked",
          discordWebhookUrl: blockedUrl,
          body: { content: `blocked ${index}` },
          now: new Date(
            Date.parse("2026-06-06T00:00:00.000Z") + index,
          ),
        });
      }
      await queueRepository.enqueueDiscordWebhookMessage({
        id: "message-unblocked",
        sourceType: "registered",
        sourceId: "registered-unblocked",
        discordWebhookUrl: unblockedUrl,
        body: { content: "unblocked" },
        now: new Date("2026-06-06T00:00:01.000Z"),
      });
      await rateLimitRepository.setDiscordUrlRateLimitForWebhookUrl({
        discordWebhookUrl: blockedUrl,
        blockedUntilEpochMs: now.getTime() + 60_000,
        retryAfterMs: 60_000,
        now,
      });

      const result = await usecase.dispatchPendingDiscordWebhookMessages({
        limit: 1,
        sendIntervalMs: 0,
        now,
      });

      assertEquals(result, {
        scanned: 51,
        sent: 1,
        skipped: 50,
        retried: 0,
        rateLimited: 0,
        dead: 0,
        deadMessages: [],
      });
      assertEquals(sender.calls, [{
        discordWebhookUrl: unblockedUrl,
        body: { content: "unblocked" },
      }]);
      assertEquals(
        (await queueRepository.getDiscordWebhookMessage("message-unblocked"))
          ?.status,
        "sent",
      );
    });
  },
});

Deno.test({
  name: "DiscordDispatchUseCase は予約競合時に送信上限を消費しない",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const queueRepository = new MockDiscordQueueRepository();
      const rateLimitRepository =
        new RejectFirstReservationRateLimitRepository();
      const sender = new RoutingDiscordSender(() => ({ ok: true }));
      const usecase = new DiscordDispatchUseCase({
        queueRepository,
        rateLimitRepository,
        sender,
        wait: () => Promise.resolve(),
      });
      const now = new Date("2026-06-06T00:00:05.000Z");
      const firstUrl = discordWebhookUrlWithToken("a".repeat(43));
      const secondUrl = discordWebhookUrlWithToken("b".repeat(43));

      await queueRepository.enqueueDiscordWebhookMessage({
        id: "message-conflict",
        sourceType: "registered",
        sourceId: "registered-conflict",
        discordWebhookUrl: firstUrl,
        body: { content: "conflict" },
        now: new Date("2026-06-06T00:00:00.000Z"),
      });
      await queueRepository.enqueueDiscordWebhookMessage({
        id: "message-send",
        sourceType: "registered",
        sourceId: "registered-send",
        discordWebhookUrl: secondUrl,
        body: { content: "send" },
        now: new Date("2026-06-06T00:00:01.000Z"),
      });

      const result = await usecase.dispatchPendingDiscordWebhookMessages({
        limit: 1,
        sendIntervalMs: 0,
        now,
      });

      assertEquals(result, {
        scanned: 2,
        sent: 1,
        skipped: 1,
        retried: 0,
        rateLimited: 0,
        dead: 0,
        deadMessages: [],
      });
      assertEquals(sender.calls, [{
        discordWebhookUrl: secondUrl,
        body: { content: "send" },
      }]);
    });
  },
});

Deno.test({
  name:
    "DiscordDispatchUseCase は最大試行回数後にリトライ可能な失敗をデッドレターに移動する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const queueRepository = new MockDiscordQueueRepository();
      const sender = new RoutingDiscordSender(() => ({
        ok: false,
        reason: "server_error",
        upstreamStatus: 500,
      }));
      const usecase = new DiscordDispatchUseCase({
        queueRepository,
        rateLimitRepository: new MockDiscordRateLimitRepository(),
        sender,
        wait: () => Promise.resolve(),
      });
      const now = new Date("2026-06-06T00:00:05.000Z");

      await queueRepository.enqueueDiscordWebhookMessage({
        id: "message-server-error",
        sourceType: "registered",
        sourceId: "registered-1",
        discordWebhookUrl: discordWebhookUrl(),
        body: { content: "server error" },
        now: new Date("2026-06-06T00:00:00.000Z"),
      });

      const result = await usecase.dispatchPendingDiscordWebhookMessages({
        maxAttempts: 1,
        sendIntervalMs: 0,
        now,
      });

      assertEquals(result, {
        scanned: 1,
        sent: 0,
        skipped: 0,
        retried: 0,
        rateLimited: 0,
        dead: 1,
        deadMessages: [{
          id: "message-server-error",
          sourceType: "registered",
          sourceId: "registered-1",
          attempts: 1,
          lastError: { reason: "max_attempts_exceeded", upstreamStatus: 500 },
          body: { content: "server error" },
        }],
      });
      assertEquals(
        await queueRepository.getDiscordWebhookMessage("message-server-error")
          .then((message) =>
            message && {
              status: message.status,
              attempts: message.attempts,
              lastError: message.lastError,
            }
          ),
        {
          status: "dead",
          attempts: 1,
          lastError: {
            reason: "max_attempts_exceeded",
            upstreamStatus: 500,
          },
        },
      );
    });
  },
});

Deno.test({
  name:
    "DiscordDispatchUseCase はキュー状態の更新が失われた場合に送信済みメッセージをカウントしない",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const queueRepository = new LostSentUpdateQueueRepository();
      const sender = new RoutingDiscordSender(() => ({ ok: true }));
      const usecase = new DiscordDispatchUseCase({
        queueRepository,
        rateLimitRepository: new MockDiscordRateLimitRepository(),
        sender,
        wait: () => Promise.resolve(),
      });
      const now = new Date("2026-06-06T00:00:05.000Z");

      await queueRepository.enqueueDiscordWebhookMessage({
        id: "message-lost-update",
        sourceType: "registered",
        sourceId: "registered-1",
        discordWebhookUrl: discordWebhookUrl(),
        body: { content: "send" },
        now: new Date("2026-06-06T00:00:00.000Z"),
      });

      const result = await usecase.dispatchPendingDiscordWebhookMessages({
        sendIntervalMs: 0,
        now,
      });

      assertEquals(result, {
        scanned: 1,
        sent: 0,
        skipped: 1,
        retried: 0,
        rateLimited: 0,
        dead: 0,
        deadMessages: [],
      });
      assertEquals(sender.calls.length, 1);
    });
  },
});

Deno.test({
  name: "DiscordDispatchUseCase は明示的な上限とデフォルトの送信間隔を適用する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const queueRepository = new MockDiscordQueueRepository();
      const sender = new RoutingDiscordSender(() => ({ ok: true }));
      const waits: number[] = [];
      const usecase = new DiscordDispatchUseCase({
        queueRepository,
        rateLimitRepository: new MockDiscordRateLimitRepository(),
        sender,
        wait: (milliseconds) => {
          waits.push(milliseconds);
          return Promise.resolve();
        },
      });
      const now = new Date("2026-06-06T00:00:05.000Z");

      for (let index = 0; index < 11; index += 1) {
        await queueRepository.enqueueDiscordWebhookMessage({
          id: `message-${index}`,
          sourceType: "registered",
          sourceId: "registered-1",
          discordWebhookUrl: discordWebhookUrlWithToken("a".repeat(43)),
          body: { content: `message ${index}` },
          now: new Date(
            Date.parse("2026-06-06T00:00:00.000Z") + index,
          ),
        });
      }

      const result = await usecase.dispatchPendingDiscordWebhookMessages({
        limit: 10,
        now,
      });

      assertEquals(result, {
        scanned: 10,
        sent: 10,
        skipped: 0,
        retried: 0,
        rateLimited: 0,
        dead: 0,
        deadMessages: [],
      });
      assertEquals(sender.calls.length, 10);
      assertEquals(waits, Array(9).fill(1_000));
      assertEquals(
        (await queueRepository.scanPendingDiscordWebhookMessages({ now }))
          .map((message) => message.id),
        ["message-10"],
      );
    });
  },
});

class RoutingDiscordSender implements DiscordSender {
  readonly calls: DiscordSendInput[] = [];

  constructor(
    private readonly responder: (
      input: DiscordSendInput,
    ) => DiscordSendResult,
  ) {}

  sendDiscordWebhook(
    input: DiscordSendInput,
  ): Promise<DiscordSendResult> {
    this.calls.push(input);
    return Promise.resolve(this.responder(input));
  }
}

class LostSentUpdateQueueRepository extends MockDiscordQueueRepository {
  override markDiscordWebhookMessageSent(
    _id: string,
    _input?: UpdateQueuedDiscordMessageInput,
  ): Promise<QueuedDiscordMessageRecord | null> {
    return Promise.resolve(null);
  }
}

class RejectFirstReservationRateLimitRepository
  extends MockDiscordRateLimitRepository {
  private shouldRejectReservation = true;

  override reserveDiscordUrlRateLimit(
    input: ReserveDiscordRateLimitInput,
  ): Promise<DiscordRateLimitRecord | null> {
    if (this.shouldRejectReservation) {
      this.shouldRejectReservation = false;
      return Promise.resolve(null);
    }

    return super.reserveDiscordUrlRateLimit(input);
  }
}

const discordWebhookUrlWithToken = (token: string): string =>
  `https://discord.com/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}/${token}`;
