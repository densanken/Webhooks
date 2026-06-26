import type { GuildWebhookCacheRecord } from "./record.ts";
import type { GuildWebhooksRepositoryInterface } from "./interface.ts";

export class MockGuildWebhooksRepository
  implements GuildWebhooksRepositoryInterface {
  private records = new Map<string, GuildWebhookCacheRecord>();

  private key(guildId: string, webhookId: string): string {
    return `${guildId}:${webhookId}`;
  }

  getGuildWebhook(
    guildId: string,
    webhookId: string,
  ): Promise<GuildWebhookCacheRecord | null> {
    return Promise.resolve(
      this.records.get(this.key(guildId, webhookId)) ?? null,
    );
  }

  listGuildWebhooks(guildId: string): Promise<GuildWebhookCacheRecord[]> {
    return Promise.resolve(
      [...this.records.values()].filter((r) => r.guildId === guildId),
    );
  }

  setGuildWebhook(record: GuildWebhookCacheRecord): Promise<void> {
    this.records.set(this.key(record.guildId, record.webhookId), record);
    return Promise.resolve();
  }

  deleteGuildWebhook(guildId: string, webhookId: string): Promise<void> {
    this.records.delete(this.key(guildId, webhookId));
    return Promise.resolve();
  }

  async bulkSync(
    guildId: string,
    toSet: GuildWebhookCacheRecord[],
    toDeleteIds: string[],
  ): Promise<void> {
    for (const id of toDeleteIds) {
      await this.deleteGuildWebhook(guildId, id);
    }
    for (const record of toSet) {
      await this.setGuildWebhook(record);
    }
  }
}
