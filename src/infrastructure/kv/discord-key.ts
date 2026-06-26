export const registeredDiscordWebhookKey = (uuid: string): Deno.KvKey => [
  "discord",
  "webhook",
  uuid,
];

export const registeredDiscordWebhookPrefix: Deno.KvKey = [
  "discord",
  "webhook",
];

export const queueMessageKey = (messageId: string): Deno.KvKey => [
  "discord",
  "queue",
  "message",
  messageId,
];

export const pendingQueueIndexKey = (
  createdAtEpochMs: number,
  messageId: string,
): Deno.KvKey => [
  "discord",
  "queue",
  "pending",
  createdAtEpochMs,
  messageId,
];

export const pendingQueueIndexPrefix: Deno.KvKey = [
  "discord",
  "queue",
  "pending",
];

export const deadQueueIndexKey = (
  updatedAtEpochMs: number,
  messageId: string,
): Deno.KvKey => [
  "discord",
  "queue",
  "dead",
  updatedAtEpochMs,
  messageId,
];

export const deadQueueIndexPrefix: Deno.KvKey = [
  "discord",
  "queue",
  "dead",
];

export const discordRateLimitKey = (
  discordWebhookUrlHash: string,
): Deno.KvKey => [
  "discord",
  "rate-limit",
  discordWebhookUrlHash,
];

export const discordGuildWebhookCacheKey = (
  guildId: string,
  webhookId: string,
): Deno.KvKey => [
  "discord",
  "guild",
  guildId,
  "webhook",
  webhookId,
];

export const discordGuildWebhookCachePrefix = (
  guildId: string,
): Deno.KvKey => [
  "discord",
  "guild",
  guildId,
  "webhook",
];
