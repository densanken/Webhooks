import {
  discordGuildWebhookCacheKey,
  discordGuildWebhookCachePrefix,
} from "../../../infrastructure/kv/discord-key.ts";
import type { GuildWebhookCacheRecord } from "./record.ts";
import type { GuildWebhooksRepositoryInterface } from "./interface.ts";

export class GuildWebhooksRepository
  implements GuildWebhooksRepositoryInterface {
  constructor(private readonly kv: Deno.Kv) {}

  async getGuildWebhook(
    guildId: string,
    webhookId: string,
  ): Promise<GuildWebhookCacheRecord | null> {
    const entry = await this.kv.get<GuildWebhookCacheRecord>(
      discordGuildWebhookCacheKey(guildId, webhookId),
    );
    return entry.value;
  }

  async listGuildWebhooks(
    guildId: string,
  ): Promise<GuildWebhookCacheRecord[]> {
    const records: GuildWebhookCacheRecord[] = [];
    const entries = this.kv.list<GuildWebhookCacheRecord>({
      prefix: discordGuildWebhookCachePrefix(guildId),
    });
    for await (const entry of entries) {
      records.push(entry.value);
    }
    return records;
  }

  async setGuildWebhook(
    record: GuildWebhookCacheRecord,
  ): Promise<void> {
    await this.kv.set(
      discordGuildWebhookCacheKey(record.guildId, record.webhookId),
      record,
    );
  }

  async deleteGuildWebhook(
    guildId: string,
    webhookId: string,
  ): Promise<void> {
    await this.kv.delete(
      discordGuildWebhookCacheKey(guildId, webhookId),
    );
  }

  async bulkSync(
    guildId: string,
    toSet: GuildWebhookCacheRecord[],
    toDeleteIds: string[],
  ): Promise<void> {
    type Op =
      | { kind: "set"; key: Deno.KvKey; value: GuildWebhookCacheRecord }
      | { kind: "delete"; key: Deno.KvKey };

    const ops: Op[] = [
      ...toSet.map((r): Op => ({
        kind: "set",
        key: discordGuildWebhookCacheKey(r.guildId, r.webhookId),
        value: r,
      })),
      ...toDeleteIds.map((id): Op => ({
        kind: "delete",
        key: discordGuildWebhookCacheKey(guildId, id),
      })),
    ];

    // Deno KV supports up to 10 mutations per atomic commit
    const BATCH_SIZE = 10;
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      let atomic = this.kv.atomic();
      for (const op of ops.slice(i, i + BATCH_SIZE)) {
        if (op.kind === "set") {
          atomic = atomic.set(op.key, op.value);
        } else {
          atomic = atomic.delete(op.key);
        }
      }
      await atomic.commit();
    }
  }
}
