import { assert, assertEquals } from "@std/assert";

import { discordRateLimitKey } from "../../../infrastructure/kv/discord-key.ts";
import {
  discordWebhookUrl,
  withMemoryKv,
} from "../../../test-helper/webhook.ts";
import { hashString } from "../../../util/crypto.ts";
import type { DiscordRateLimitRecord } from "./interface.ts";
import { DiscordRateLimitRepository } from "./impl.ts";

Deno.test("DiscordRateLimitRepository は URL ハッシュでレート制限レコードを保存・取得する", async () => {
  await withMemoryKv(async (kv) => {
    const repository = new DiscordRateLimitRepository(kv);
    const url = discordWebhookUrl();
    const urlHash = await hashString(url);

    const record = await repository.setDiscordUrlRateLimitForWebhookUrl({
      discordWebhookUrl: url,
      blockedUntilEpochMs: 1_781_318_401_000,
      retryAfterMs: 2_500,
      scope: "webhook",
      bucket: "bucket-1",
      now: new Date("2026-06-06T00:00:00.000Z"),
    });

    assertEquals(record, {
      discordWebhookUrlHash: urlHash,
      blockedUntilEpochMs: 1_781_318_401_000,
      retryAfterMs: 2_500,
      scope: "webhook",
      bucket: "bucket-1",
      updatedAt: "2026-06-06T00:00:00.000Z",
    });
    assertEquals(await repository.getDiscordUrlRateLimit(urlHash), record);
    assertEquals(
      await repository.getDiscordUrlRateLimitForWebhookUrl(url),
      record,
    );

    const raw = await kv.get<DiscordRateLimitRecord>(
      discordRateLimitKey(urlHash),
    );
    assert(raw.value);
    assert(!JSON.stringify(raw.value).includes(url));
  });
});

Deno.test("DiscordRateLimitRepository はレート制限レコードを削除する", async () => {
  await withMemoryKv(async (kv) => {
    const repository = new DiscordRateLimitRepository(kv);
    const urlHash = await hashString(discordWebhookUrl());

    await repository.setDiscordUrlRateLimit({
      discordWebhookUrlHash: urlHash,
      blockedUntilEpochMs: 1_781_318_401_000,
      retryAfterMs: 2_500,
      now: new Date("2026-06-06T00:00:00.000Z"),
    });

    await repository.deleteDiscordUrlRateLimit(urlHash);

    assertEquals(await repository.getDiscordUrlRateLimit(urlHash), null);
  });
});

Deno.test("DiscordRateLimitRepository は URL 送信スロットを予約・解放する", async () => {
  await withMemoryKv(async (kv) => {
    const repository = new DiscordRateLimitRepository(kv);
    const urlHash = await hashString(discordWebhookUrl());
    const now = new Date("2026-06-06T00:00:00.000Z");

    const reserved = await repository.reserveDiscordUrlRateLimit({
      discordWebhookUrlHash: urlHash,
      reservationId: "reservation-1",
      reservationMs: 1_000,
      now,
    });
    const duplicate = await repository.reserveDiscordUrlRateLimit({
      discordWebhookUrlHash: urlHash,
      reservationId: "reservation-2",
      reservationMs: 1_000,
      now,
    });
    const wrongRelease = await repository.releaseDiscordUrlRateLimitReservation(
      {
        discordWebhookUrlHash: urlHash,
        reservationId: "reservation-2",
      },
    );
    const released = await repository.releaseDiscordUrlRateLimitReservation({
      discordWebhookUrlHash: urlHash,
      reservationId: "reservation-1",
    });

    assertEquals(reserved, {
      discordWebhookUrlHash: urlHash,
      blockedUntilEpochMs: now.getTime() + 1_000,
      retryAfterMs: 1_000,
      reservationId: "reservation-1",
      scope: "dispatcher_send",
      updatedAt: "2026-06-06T00:00:00.000Z",
    });
    assertEquals(duplicate, null);
    assertEquals(wrongRelease, false);
    assertEquals(released, true);
    assertEquals(await repository.getDiscordUrlRateLimit(urlHash), null);
  });
});
