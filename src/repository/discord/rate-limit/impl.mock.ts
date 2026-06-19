import { parseDiscordWebhookUrl } from "../../../util/discord/webhook-url.ts";
import { hashString } from "../../../util/crypto.ts";
import type {
  DiscordRateLimitRecord,
  DiscordRateLimitRepositoryInterface,
  ReleaseDiscordRateLimitReservationInput,
  ReserveDiscordRateLimitInput,
  SetDiscordRateLimitForUrlInput,
  SetDiscordRateLimitInput,
} from "./interface.ts";
import { createDiscordRateLimitRecord } from "./record.ts";

export class MockDiscordRateLimitRepository
  implements DiscordRateLimitRepositoryInterface {
  constructor(private records: DiscordRateLimitRecord[] = []) {}

  getDiscordUrlRateLimit(
    discordWebhookUrlHash: string,
  ): Promise<DiscordRateLimitRecord | null> {
    return Promise.resolve(
      this.records.find((record) =>
        record.discordWebhookUrlHash === discordWebhookUrlHash
      ) ?? null,
    );
  }

  async getDiscordUrlRateLimitForWebhookUrl(
    discordWebhookUrl: string,
  ): Promise<DiscordRateLimitRecord | null> {
    const { hash } = await this.normalizeDiscordWebhookUrl(discordWebhookUrl);
    return await this.getDiscordUrlRateLimit(hash);
  }

  setDiscordUrlRateLimit(
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

    this.records = [
      ...this.records.filter((record) =>
        record.discordWebhookUrlHash !== input.discordWebhookUrlHash
      ),
      record,
    ];
    return Promise.resolve(record);
  }

  async setDiscordUrlRateLimitForWebhookUrl(
    input: SetDiscordRateLimitForUrlInput,
  ): Promise<DiscordRateLimitRecord> {
    const { hash } = await this.normalizeDiscordWebhookUrl(
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

  reserveDiscordUrlRateLimit(
    input: ReserveDiscordRateLimitInput,
  ): Promise<DiscordRateLimitRecord | null> {
    const now = input.now ?? new Date();
    const existing = this.records.find((record) =>
      record.discordWebhookUrlHash === input.discordWebhookUrlHash
    );
    if (
      existing !== undefined && existing.blockedUntilEpochMs > now.getTime()
    ) {
      return Promise.resolve(null);
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
    this.records = [
      ...this.records.filter((record) =>
        record.discordWebhookUrlHash !== input.discordWebhookUrlHash
      ),
      record,
    ];

    return Promise.resolve(record);
  }

  releaseDiscordUrlRateLimitReservation(
    input: ReleaseDiscordRateLimitReservationInput,
  ): Promise<boolean> {
    const existing = this.records.find((record) =>
      record.discordWebhookUrlHash === input.discordWebhookUrlHash
    );
    if (existing?.reservationId !== input.reservationId) {
      return Promise.resolve(false);
    }

    this.records = this.records.filter((record) =>
      record.discordWebhookUrlHash !== input.discordWebhookUrlHash
    );
    return Promise.resolve(true);
  }

  deleteDiscordUrlRateLimit(discordWebhookUrlHash: string): Promise<void> {
    this.records = this.records.filter((record) =>
      record.discordWebhookUrlHash !== discordWebhookUrlHash
    );
    return Promise.resolve();
  }

  private async normalizeDiscordWebhookUrl(
    discordWebhookUrl: string,
  ): Promise<{ url: string; hash: string }> {
    const parsedUrl = parseDiscordWebhookUrl(discordWebhookUrl);

    return {
      url: parsedUrl.url,
      hash: await hashString(parsedUrl.url),
    };
  }
}
