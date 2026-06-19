import type { DiscordRateLimitRecord } from "./interface.ts";

export const createDiscordRateLimitRecord = (
  input: DiscordRateLimitRecord,
): DiscordRateLimitRecord => ({
  discordWebhookUrlHash: input.discordWebhookUrlHash,
  blockedUntilEpochMs: input.blockedUntilEpochMs,
  retryAfterMs: input.retryAfterMs,
  ...(input.reservationId === undefined ? {} : {
    reservationId: input.reservationId,
  }),
  ...(input.scope === undefined ? {} : { scope: input.scope }),
  ...(input.bucket === undefined ? {} : { bucket: input.bucket }),
  updatedAt: input.updatedAt,
});
