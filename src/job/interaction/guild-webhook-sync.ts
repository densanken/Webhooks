import { Kv } from "../../infrastructure/kv/client.ts";
import { GuildWebhooksRepository } from "../../repository/discord/guild-webhooks/impl.ts";
import { GuildWebhooksUseCase } from "../../usecase/discord/guild-webhook/impl.ts";

export const DISCORD_GUILD_WEBHOOK_SYNC_CRON_NAME =
  "sync-discord-guild-webhooks";
export const DISCORD_GUILD_WEBHOOK_SYNC_CRON_SCHEDULE = "0 5 * * *";

export const syncAllGuildWebhooks = async (): Promise<void> => {
  try {
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN")?.trim();
    if (!botToken) {
      console.error(
        `[cron:${DISCORD_GUILD_WEBHOOK_SYNC_CRON_NAME}] DISCORD_BOT_TOKEN is not set`,
      );
      return;
    }

    const allowedGuildIds = (Deno.env.get("DISCORD_ALLOWED_GUILD_IDS") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id !== "");

    if (allowedGuildIds.length === 0) {
      console.error(
        `[cron:${DISCORD_GUILD_WEBHOOK_SYNC_CRON_NAME}] DISCORD_ALLOWED_GUILD_IDS is not set`,
      );
      return;
    }

    const kv = await Kv.getKv();
    const repository = new GuildWebhooksRepository(kv);
    const useCase = new GuildWebhooksUseCase(repository, { botToken });

    let totalFetched = 0;
    let totalAdded = 0;
    let totalUpdated = 0;
    let totalRemoved = 0;

    for (const guildId of allowedGuildIds) {
      const result = await useCase.syncGuildWebhooks(guildId);
      totalFetched += result.fetched;
      totalAdded += result.added;
      totalUpdated += result.updated;
      totalRemoved += result.removed;
    }

    console.log(
      `[cron:${DISCORD_GUILD_WEBHOOK_SYNC_CRON_NAME}] guilds=${allowedGuildIds.length} fetched=${totalFetched} added=${totalAdded} updated=${totalUpdated} removed=${totalRemoved}`,
    );
  } catch (error) {
    console.error(
      `[cron:${DISCORD_GUILD_WEBHOOK_SYNC_CRON_NAME}] sync run failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

if (typeof Deno.cron === "function") {
  Deno.cron(
    DISCORD_GUILD_WEBHOOK_SYNC_CRON_NAME,
    DISCORD_GUILD_WEBHOOK_SYNC_CRON_SCHEDULE,
    syncAllGuildWebhooks,
  );
}
