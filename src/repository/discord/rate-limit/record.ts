import type { DiscordRateLimitRecord } from "./interface.ts";

export const createDiscordRateLimitRecord = (
  input: DiscordRateLimitRecord,
): DiscordRateLimitRecord => ({
  discordWebhookUrlHash: input.discordWebhookUrlHash,
  blockedUntilEpochMs: input.blockedUntilEpochMs,
  retryAfterMs: input.retryAfterMs,
  reservationId: input.reservationId,
  scope: input.scope,
  bucket: input.bucket,
  updatedAt: input.updatedAt,
});
