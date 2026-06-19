import { assert, assertEquals, assertStringIncludes } from "@std/assert";

import {
  deadQueueIndexKey,
  pendingQueueIndexKey,
  queueMessageKey,
} from "../../../infrastructure/kv/discord-key.ts";
import {
  discordWebhookUrl,
  ENV_PERMISSION,
  VALID_DISCORD_WEBHOOK_TOKEN,
  withEncryptionKey,
  withMemoryKv,
} from "../../../test-helper/webhook.ts";
import { hashString } from "../../../util/crypto.ts";
import type { DeadQueueIndex, PendingQueueIndex } from "./interface.ts";
import { DiscordQueueRepository } from "./impl.ts";
import type { QueuedDiscordMessageKvRecord } from "./record.ts";
import { decryptQueuedDiscordWebhookUrl } from "./secret.ts";

Deno.test({
  name:
    "DiscordQueueRepository は平文 URL を保存せずにメッセージと保留インデックスを不可分に作成する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordQueueRepository(kv);
        const id = "message-1";
        const now = new Date("2026-06-06T00:00:00.000Z");
        const url = discordWebhookUrl();

        const record = await repository.enqueueDiscordWebhookMessage({
          id,
          sourceType: "registered",
          sourceId: "registered-1",
          discordWebhookUrl: url,
          body: { content: "hello" },
          now,
        });

        assertEquals(record.status, "pending");
        assertEquals(record.attempts, 0);
        assertEquals(record.discordWebhookUrlHash, await hashString(url));
        assertEquals(record.discordWebhookUrl, url);

        const rawMessage = await kv.get<QueuedDiscordMessageKvRecord>(
          queueMessageKey(id),
        );
        const rawPendingIndex = await kv.get<PendingQueueIndex>(
          pendingQueueIndexKey(now.getTime(), id),
        );
        assert(rawMessage.value);
        assertEquals(rawPendingIndex.value, { messageId: id });
        assertEquals(
          await decryptQueuedDiscordWebhookUrl(rawMessage.value),
          url,
        );

        const rawJson = JSON.stringify(rawMessage.value);
        assert(!rawJson.includes(url));
        assert(!rawJson.includes(VALID_DISCORD_WEBHOOK_TOKEN));
        assertStringIncludes(rawJson, "encryptedDiscordWebhookUrl");
      });
    });
  },
});

Deno.test({
  name: "DiscordQueueRepository は保留中メッセージを FIFO 順でスキャンする",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordQueueRepository(kv);

        await repository.enqueueDiscordWebhookMessage({
          id: "message-1",
          sourceType: "registered",
          sourceId: "registered-1",
          discordWebhookUrl: discordWebhookUrl(),
          body: { content: "first" },
          now: new Date("2026-06-06T00:00:00.000Z"),
        });
        await repository.enqueueDiscordWebhookMessage({
          id: "message-2",
          sourceType: "dynamic",
          sourceId: "token-1",
          discordWebhookUrl: discordWebhookUrl("discordapp.com"),
          body: { content: "second" },
          now: new Date("2026-06-06T00:00:01.000Z"),
        });

        assertEquals(
          (await repository.scanPendingDiscordWebhookMessages()).map((record) =>
            record.id
          ),
          ["message-1", "message-2"],
        );
        assertEquals(
          (await repository.scanPendingDiscordWebhookMessages({ limit: 1 }))
            .map((record) => record.id),
          ["message-1"],
        );
      });
    });
  },
});

Deno.test({
  name:
    "DiscordQueueRepository はカーソルページで保留中メッセージをスキャンする",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordQueueRepository(kv);

        for (let index = 0; index < 3; index += 1) {
          await repository.enqueueDiscordWebhookMessage({
            id: `message-${index}`,
            sourceType: "registered",
            sourceId: "registered-1",
            discordWebhookUrl: discordWebhookUrl(),
            body: { content: `message ${index}` },
            now: new Date(
              Date.parse("2026-06-06T00:00:00.000Z") + index,
            ),
          });
        }

        const firstPage = await repository
          .scanPendingDiscordWebhookMessagePage({ limit: 2 });
        const secondPage = await repository
          .scanPendingDiscordWebhookMessagePage({
            cursor: firstPage.cursor,
            limit: 2,
          });

        assertEquals(firstPage.messages.map((message) => message.id), [
          "message-0",
          "message-1",
        ]);
        assertEquals(firstPage.scannedCount, 2);
        assert(firstPage.cursor);
        assertEquals(secondPage.messages.map((message) => message.id), [
          "message-2",
        ]);
        assertEquals(secondPage.scannedCount, 1);
        assertEquals(secondPage.cursor, undefined);
      });
    });
  },
});

Deno.test({
  name: "DiscordQueueRepository はリース付きで保留中メッセージを取得する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordQueueRepository(kv);
        const now = new Date("2026-06-06T00:00:00.000Z");

        await repository.enqueueDiscordWebhookMessage({
          id: "message-1",
          sourceType: "registered",
          sourceId: "registered-1",
          discordWebhookUrl: discordWebhookUrl(),
          body: { content: "hello" },
          now,
        });

        const claimed = await repository.claimDiscordWebhookMessage(
          "message-1",
          {
            claimId: "claim-1",
            now,
            leaseMs: 1_000,
          },
        );

        assertEquals(claimed?.status, "processing");
        assertEquals(
          claimed?.processingUntilEpochMs,
          now.getTime() + 1_000,
        );
        assertEquals(
          await repository.claimDiscordWebhookMessage("message-1", {
            claimId: "claim-2",
            now,
            leaseMs: 1_000,
          }),
          null,
        );
        assertEquals(
          await repository.scanPendingDiscordWebhookMessages({ now }),
          [],
        );
        assertEquals(
          (await repository.scanPendingDiscordWebhookMessages({
            now: new Date(now.getTime() + 1_001),
          })).map((record) => record.id),
          ["message-1"],
        );
      });
    });
  },
});

Deno.test({
  name:
    "DiscordQueueRepository は有効なリースを除外してからスキャン上限を適用する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordQueueRepository(kv);
        const now = new Date("2026-06-06T00:00:05.000Z");

        await repository.enqueueDiscordWebhookMessage({
          id: "message-processing",
          sourceType: "registered",
          sourceId: "registered-1",
          discordWebhookUrl: discordWebhookUrl(),
          body: { content: "processing" },
          now: new Date("2026-06-06T00:00:00.000Z"),
        });
        await repository.enqueueDiscordWebhookMessage({
          id: "message-pending",
          sourceType: "registered",
          sourceId: "registered-2",
          discordWebhookUrl: discordWebhookUrl("discordapp.com"),
          body: { content: "pending" },
          now: new Date("2026-06-06T00:00:01.000Z"),
        });

        await repository.claimDiscordWebhookMessage("message-processing", {
          claimId: "claim-processing",
          now,
          leaseMs: 60_000,
        });

        assertEquals(
          (await repository.scanPendingDiscordWebhookMessages({
            limit: 1,
            now,
          })).map((record) => record.id),
          ["message-pending"],
        );
      });
    });
  },
});

Deno.test({
  name: "DiscordQueueRepository は古いメッセージクレームによる更新を拒否する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordQueueRepository(kv);
        const createdAt = new Date("2026-06-06T00:00:00.000Z");
        const reclaimAt = new Date("2026-06-06T00:00:02.000Z");

        await repository.enqueueDiscordWebhookMessage({
          id: "message-1",
          sourceType: "registered",
          sourceId: "registered-1",
          discordWebhookUrl: discordWebhookUrl(),
          body: { content: "hello" },
          now: createdAt,
        });
        await repository.claimDiscordWebhookMessage("message-1", {
          claimId: "claim-old",
          now: createdAt,
          leaseMs: 1,
        });
        const reclaimed = await repository.claimDiscordWebhookMessage(
          "message-1",
          {
            claimId: "claim-new",
            now: reclaimAt,
            leaseMs: 1_000,
          },
        );
        const staleFailure = await repository
          .recordDiscordWebhookMessageFailure(
            "message-1",
            {
              claimId: "claim-old",
              lastError: { reason: "network_error" },
              now: reclaimAt,
            },
          );
        const sent = await repository.markDiscordWebhookMessageSent(
          "message-1",
          {
            claimId: "claim-new",
            now: reclaimAt,
          },
        );

        assertEquals(reclaimed?.claimId, "claim-new");
        assertEquals(staleFailure, null);
        assertEquals(sent?.status, "sent");
      });
    });
  },
});

Deno.test({
  name:
    "DiscordQueueRepository はリトライ解放時にメッセージクレームを使用済みにする",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordQueueRepository(kv);
        const now = new Date("2026-06-06T00:00:00.000Z");

        await repository.enqueueDiscordWebhookMessage({
          id: "message-1",
          sourceType: "registered",
          sourceId: "registered-1",
          discordWebhookUrl: discordWebhookUrl(),
          body: { content: "hello" },
          now,
        });
        await repository.claimDiscordWebhookMessage("message-1", {
          claimId: "claim-1",
          now,
          leaseMs: 1_000,
        });
        const failed = await repository.recordDiscordWebhookMessageFailure(
          "message-1",
          {
            claimId: "claim-1",
            lastError: { reason: "network_error" },
            now,
          },
        );
        const staleSent = await repository.markDiscordWebhookMessageSent(
          "message-1",
          {
            claimId: "claim-1",
            now,
          },
        );

        assertEquals(failed?.status, "pending");
        assertEquals(staleSent, null);
      });
    });
  },
});

Deno.test({
  name:
    "DiscordQueueRepository は送信済みメッセージをマークし保留インデックスを削除する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordQueueRepository(kv);
        const id = "message-1";
        const createdAt = new Date("2026-06-06T00:00:00.000Z");

        await repository.enqueueDiscordWebhookMessage({
          id,
          sourceType: "registered",
          sourceId: "registered-1",
          discordWebhookUrl: discordWebhookUrl(),
          body: { content: "hello" },
          now: createdAt,
        });

        const sent = await repository.markDiscordWebhookMessageSent(id, {
          now: new Date("2026-06-06T00:00:02.000Z"),
        });

        assertEquals(sent?.status, "sent");
        assertEquals(sent?.updatedAt, "2026-06-06T00:00:02.000Z");
        assertEquals(
          await kv.get(pendingQueueIndexKey(createdAt.getTime(), id)).then((
            entry,
          ) => entry.value),
          null,
        );
        assertEquals(await repository.scanPendingDiscordWebhookMessages(), []);
      });
    });
  },
});

Deno.test({
  name:
    "DiscordQueueRepository はメッセージをデッドレターに移してインデックスを作成する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordQueueRepository(kv);
        const id = "message-1";
        const createdAt = new Date("2026-06-06T00:00:00.000Z");
        const updatedAt = new Date("2026-06-06T00:00:02.000Z");

        await repository.enqueueDiscordWebhookMessage({
          id,
          sourceType: "registered",
          sourceId: "registered-1",
          discordWebhookUrl: discordWebhookUrl(),
          body: { content: "hello" },
          now: createdAt,
        });

        const dead = await repository.moveDiscordWebhookMessageToDeadLetter(
          id,
          {
            lastError: { reason: "not_found", upstreamStatus: 404 },
            now: updatedAt,
          },
        );

        assertEquals(dead?.status, "dead");
        assertEquals(dead?.lastError, {
          reason: "not_found",
          upstreamStatus: 404,
        });
        assertEquals(
          await kv.get(pendingQueueIndexKey(createdAt.getTime(), id)).then((
            entry,
          ) => entry.value),
          null,
        );
        assertEquals(
          await kv.get<DeadQueueIndex>(
            deadQueueIndexKey(updatedAt.getTime(), id),
          )
            .then((entry) => entry.value),
          { messageId: id },
        );
        assertEquals(
          (await repository.listDeadDiscordWebhookMessages()).map((record) =>
            record.id
          ),
          [id],
        );
      });
    });
  },
});

Deno.test({
  name: "DiscordQueueRepository はメッセージを保留のままリトライ失敗を記録する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordQueueRepository(kv);

        await repository.enqueueDiscordWebhookMessage({
          id: "message-1",
          sourceType: "dynamic",
          sourceId: "token-1",
          discordWebhookUrl: discordWebhookUrl(),
          body: { content: "hello" },
          now: new Date("2026-06-06T00:00:00.000Z"),
        });

        const failed = await repository.recordDiscordWebhookMessageFailure(
          "message-1",
          {
            lastError: { reason: "network_error" },
            now: new Date("2026-06-06T00:00:01.000Z"),
          },
        );

        assertEquals(failed?.status, "pending");
        assertEquals(failed?.attempts, 1);
        assertEquals(failed?.lastError, { reason: "network_error" });
        assertEquals(
          (await repository.scanPendingDiscordWebhookMessages()).map((
            record,
          ) => record.id),
          [
            "message-1",
          ],
        );
      });
    });
  },
});

Deno.test({
  name:
    "DiscordQueueRepository は保留中でないメッセージへの最終状態更新を無視する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordQueueRepository(kv);
        const id = "message-1";

        await repository.enqueueDiscordWebhookMessage({
          id,
          sourceType: "registered",
          sourceId: "registered-1",
          discordWebhookUrl: discordWebhookUrl(),
          body: { content: "hello" },
          now: new Date("2026-06-06T00:00:00.000Z"),
        });

        const sent = await repository.markDiscordWebhookMessageSent(id, {
          now: new Date("2026-06-06T00:00:01.000Z"),
        });
        const dead = await repository.moveDiscordWebhookMessageToDeadLetter(
          id,
          {
            lastError: { reason: "not_found", upstreamStatus: 404 },
            now: new Date("2026-06-06T00:00:02.000Z"),
          },
        );
        const failed = await repository.recordDiscordWebhookMessageFailure(id, {
          lastError: { reason: "network_error" },
          now: new Date("2026-06-06T00:00:03.000Z"),
        });

        assertEquals(sent?.status, "sent");
        assertEquals(dead, null);
        assertEquals(failed, null);
        assertEquals(await repository.getDiscordWebhookMessage(id), sent);
        assertEquals(await repository.listDeadDiscordWebhookMessages(), []);
      });
    });
  },
});

Deno.test({
  name: "DiscordQueueRepository は構造化された lastError だけを保存する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordQueueRepository(kv);
        const id = "message-1";
        const url = discordWebhookUrl();

        await repository.enqueueDiscordWebhookMessage({
          id,
          sourceType: "dynamic",
          sourceId: "token-1",
          discordWebhookUrl: url,
          body: { content: "hello" },
          now: new Date("2026-06-06T00:00:00.000Z"),
        });

        const failed = await repository.recordDiscordWebhookMessageFailure(id, {
          lastError: {
            reason: url as "unknown",
            upstreamStatus: url as unknown as number,
          },
          now: new Date("2026-06-06T00:00:01.000Z"),
        });
        const rawMessage = await kv.get<QueuedDiscordMessageKvRecord>(
          queueMessageKey(id),
        );

        assertEquals(failed?.lastError, {
          reason: "unknown",
        });
        assert(rawMessage.value);
        assert(!JSON.stringify(rawMessage.value).includes(url));
        assert(
          !JSON.stringify(rawMessage.value).includes(
            VALID_DISCORD_WEBHOOK_TOKEN,
          ),
        );
      });
    });
  },
});
