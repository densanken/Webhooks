export type GuildWebhookCacheRecord = {
  guildId: string;
  webhookId: string;
  channelId: string | null;
  name: string | null;
  fetchedAt: string;
};
