import { discordRateLimitKey } from "../../../infrastructure/kv/discord-key.ts";
import {
  normalizeAndHashDiscordWebhookUrl,
} from "../../../infrastructure/discord-webhook-secret.ts";
import type {
  DiscordRateLimitRecord,
  DiscordRateLimitRepositoryInterface,
  ReleaseDiscordRateLimitReservationInput,
  ReserveDiscordRateLimitInput,
  SetDiscordRateLimitForUrlInput,
  SetDiscordRateLimitInput,
} from "./interface.ts";
import { createDiscordRateLimitRecord } from "./record.ts";

export class DiscordRateLimitRepository
  implements DiscordRateLimitRepositoryInterface {
  constructor(private readonly kv: Deno.Kv) {}

  async getDiscordUrlRateLimit(
    discordWebhookUrlHash: string,
  ): Promise<DiscordRateLimitRecord | null> {
    const entry = await this.kv.get<DiscordRateLimitRecord>(
      discordRateLimitKey(discordWebhookUrlHash),
    );

    return entry.value;
  }

  async getDiscordUrlRateLimitForWebhookUrl(
    discordWebhookUrl: string,
  ): Promise<DiscordRateLimitRecord | null> {
    const { hash } = await normalizeAndHashDiscordWebhookUrl(discordWebhookUrl);
    return await this.getDiscordUrlRateLimit(hash);
  }

  async setDiscordUrlRateLimit(
    input: SetDiscordRateLimitInput,
  ): Promise<DiscordRateLimitRecord> {
    const record = createDiscordRateLimitRecord({
      discordWebhookUrlHash: input.discordWebhookUrlHash,
      blockedUntilEpochMs: input.blockedUntilEpochMs,
      retryAfterMs: input.retryAfterMs,
      scope: input.scope,
      bucket: input.bucket,
      updatedAt: (input.now ?? new Date()).toISOString(),
    });

    await this.kv.set(discordRateLimitKey(input.discordWebhookUrlHash), record);
    return record;
  }

  async setDiscordUrlRateLimitForWebhookUrl(
    input: SetDiscordRateLimitForUrlInput,
  ): Promise<DiscordRateLimitRecord> {
    const { hash } = await normalizeAndHashDiscordWebhookUrl(
      input.discordWebhookUrl,
    );

    return await this.setDiscordUrlRateLimit({
      discordWebhookUrlHash: hash,
      blockedUntilEpochMs: input.blockedUntilEpochMs,
      retryAfterMs: input.retryAfterMs,
      scope: input.scope,
      bucket: input.bucket,
      now: input.now,
    });
  }

  async reserveDiscordUrlRateLimit(
    input: ReserveDiscordRateLimitInput,
  ): Promise<DiscordRateLimitRecord | null> {
    const key = discordRateLimitKey(input.discordWebhookUrlHash);
    const entry = await this.kv.get<DiscordRateLimitRecord>(key);
    const now = input.now ?? new Date();
    if (
      entry.value !== null &&
      entry.value.blockedUntilEpochMs > now.getTime()
    ) {
      return null;
    }

    const reservationMs = Math.max(1, Math.trunc(input.reservationMs));
    const record = createDiscordRateLimitRecord({
      discordWebhookUrlHash: input.discordWebhookUrlHash,
      blockedUntilEpochMs: now.getTime() + reservationMs,
      retryAfterMs: reservationMs,
      reservationId: input.reservationId,
      scope: "dispatcher_send",
      updatedAt: now.toISOString(),
    });

    const result = await this.kv.atomic()
      .check({ key, versionstamp: entry.versionstamp })
      .set(key, record)
      .commit();

    return result.ok ? record : null;
  }

  async releaseDiscordUrlRateLimitReservation(
    input: ReleaseDiscordRateLimitReservationInput,
  ): Promise<boolean> {
    const key = discordRateLimitKey(input.discordWebhookUrlHash);
    const entry = await this.kv.get<DiscordRateLimitRecord>(key);
    if (entry.value?.reservationId !== input.reservationId) return false;

    const result = await this.kv.atomic()
      .check({ key, versionstamp: entry.versionstamp })
      .delete(key)
      .commit();

    return result.ok;
  }

  async deleteDiscordUrlRateLimit(
    discordWebhookUrlHash: string,
  ): Promise<void> {
    await this.kv.delete(discordRateLimitKey(discordWebhookUrlHash));
  }
}
