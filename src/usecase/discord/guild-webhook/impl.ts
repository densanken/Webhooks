import type { GuildWebhooksRepositoryInterface } from "../../../repository/discord/guild-webhooks/interface.ts";
import type {
  GuildWebhooksUseCaseInterface,
  GuildWebhooksUseCaseOptions,
  GuildWebhookSyncResult,
} from "./interface.ts";
import type { GuildWebhookCacheRecord } from "../../../repository/discord/guild-webhooks/record.ts";

type DiscordApiWebhook = {
  id: string;
  type: number;
  channel_id: string | null;
  name: string | null;
  token?: string;
};

export class GuildWebhooksUseCase implements GuildWebhooksUseCaseInterface {
  private readonly botToken: string;
  private readonly fetcher: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  private readonly syncInProgress = new Map<
    string,
    Promise<GuildWebhookSyncResult>
  >();

  constructor(
    private readonly repository: GuildWebhooksRepositoryInterface,
    options: GuildWebhooksUseCaseOptions,
  ) {
    this.botToken = options.botToken;
    this.fetcher = options.fetcher ?? fetch;
  }

  async syncGuildWebhooks(guildId: string): Promise<GuildWebhookSyncResult> {
    const allWebhooks = await this.fetchGuildWebhooks(guildId);
    // token field is only present on Incoming webhooks (type 1); Channel Follower and Application webhooks lack it
    const webhooks = allWebhooks.filter((w) =>
      w.type === 1 && w.token !== undefined
    );
    const fetchedAt = new Date().toISOString();

    const fetchedIds = new Set(webhooks.map((w) => w.id));
    const existing = await this.repository.listGuildWebhooks(guildId);
    const existingIds = new Set(existing.map((r) => r.webhookId));

    const toSet: GuildWebhookCacheRecord[] = webhooks.map((w) => ({
      guildId,
      webhookId: w.id,
      channelId: w.channel_id ?? null,
      name: w.name ?? null,
      fetchedAt,
    }));
    const toDeleteIds = existing
      .filter((r) => !fetchedIds.has(r.webhookId))
      .map((r) => r.webhookId);

    const added = toSet.filter((r) => !existingIds.has(r.webhookId)).length;
    const updated = toSet.filter((r) => existingIds.has(r.webhookId)).length;

    await this.repository.bulkSync(guildId, toSet, toDeleteIds);

    return {
      guildId,
      fetched: webhooks.length,
      added,
      updated,
      removed: toDeleteIds.length,
    };
  }

  async isGuildWebhook(
    guildId: string,
    webhookId: string,
  ): Promise<boolean> {
    const record = await this.repository.getGuildWebhook(guildId, webhookId);
    return record !== null;
  }

  async isGuildWebhookWithRefresh(
    guildId: string,
    webhookId: string,
  ): Promise<boolean> {
    if (await this.isGuildWebhook(guildId, webhookId)) {
      return true;
    }

    // Deduplicate concurrent refresh calls for the same guild
    let syncPromise = this.syncInProgress.get(guildId);
    if (!syncPromise) {
      syncPromise = this.syncGuildWebhooks(guildId).finally(() => {
        this.syncInProgress.delete(guildId);
      });
      this.syncInProgress.set(guildId, syncPromise);
    }
    await syncPromise;

    return this.isGuildWebhook(guildId, webhookId);
  }

  private async fetchGuildWebhooks(
    guildId: string,
  ): Promise<DiscordApiWebhook[]> {
    const response = await this.fetcher(
      `https://discord.com/api/v10/guilds/${
        encodeURIComponent(guildId)
      }/webhooks`,
      {
        headers: {
          authorization: `Bot ${this.botToken}`,
        },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "(unreadable)");
      throw new Error(
        `Failed to fetch guild webhooks: ${response.status} ${body}`,
      );
    }

    return await response.json();
  }
}
