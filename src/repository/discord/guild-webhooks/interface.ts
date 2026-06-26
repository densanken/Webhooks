import type { GuildWebhookCacheRecord } from "./record.ts";

export interface GuildWebhooksRepositoryInterface {
  getGuildWebhook(
    guildId: string,
    webhookId: string,
  ): Promise<GuildWebhookCacheRecord | null>;
  listGuildWebhooks(
    guildId: string,
  ): Promise<GuildWebhookCacheRecord[]>;
  setGuildWebhook(
    record: GuildWebhookCacheRecord,
  ): Promise<void>;
  deleteGuildWebhook(
    guildId: string,
    webhookId: string,
  ): Promise<void>;
  bulkSync(
    guildId: string,
    toSet: GuildWebhookCacheRecord[],
    toDeleteIds: string[],
  ): Promise<void>;
}
