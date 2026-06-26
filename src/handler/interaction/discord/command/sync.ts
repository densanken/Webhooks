import {
  type APIApplicationCommandSubcommandOption,
  type APIInteraction,
  type APIInteractionResponse,
  ApplicationCommandOptionType,
} from "discord-api-types/v10";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import {
  deferredEphemeral,
  EmbedColor,
  ephemeralMessage,
} from "../../response.ts";
import { isAdmin } from "../../permissions.ts";
import { sendFollowupEmbed } from "../../../../util/discord/interaction/send-followup.ts";

export const DISCORD_SYNC_SUBCOMMAND: APIApplicationCommandSubcommandOption = {
  name: "sync",
  description: "Discord Webhook キャッシュを更新する",
  type: ApplicationCommandOptionType.Subcommand,
};

const SYNC_COOLDOWN_MS = 60_000;
const SYNC_COOLDOWN_CACHE = "sync-cooldown";

const getSyncCooldownRemaining = async (
  guildId: string,
): Promise<number | null> => {
  const cache = await caches.open(SYNC_COOLDOWN_CACHE);
  const cached = await cache.match(
    new Request(`https://internal/${guildId}`),
  );
  if (!cached) return null;
  const elapsed = Date.now() - Number(await cached.text());
  if (elapsed < SYNC_COOLDOWN_MS) {
    return Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000);
  }
  return null;
};

const setSyncCooldown = async (guildId: string): Promise<void> => {
  const cache = await caches.open(SYNC_COOLDOWN_CACHE);
  await cache.put(
    new Request(`https://internal/${guildId}`),
    new Response(String(Date.now())),
  );
};

const clearSyncCooldown = async (guildId: string): Promise<void> => {
  const cache = await caches.open(SYNC_COOLDOWN_CACHE);
  await cache.delete(new Request(`https://internal/${guildId}`));
};

export const handleSync = async (
  interaction: APIInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> => {
  const { guildId, member } = ctx;
  const admin = isAdmin(member.permissions);

  const remaining = await getSyncCooldownRemaining(guildId);

  if (remaining !== null) {
    return ephemeralMessage({
      title: "レートリミット",
      color: EmbedColor.Default,
      footer: {
        text: `${remaining} 秒後に再試行してください`,
      },
    });
  }

  await setSyncCooldown(guildId);

  const { discordApplicationId } = deps.env;
  const { token: interactionToken } = interaction;

  (async () => {
    try {
      const result = await deps.guildWebhooksUseCase.syncGuildWebhooks(guildId);
      await sendFollowupEmbed(discordApplicationId, interactionToken, {
        title: "Webhook キャッシュを更新しました",
        color: EmbedColor.Success,
        ...(admin
          ? {
            fields: [
              {
                name: "追加",
                value: `${String(result.added)}件`,
                inline: true,
              },
              {
                name: "更新",
                value: `${String(result.updated)}件`,
                inline: true,
              },
              {
                name: "削除",
                value: `${String(result.removed)}件`,
                inline: true,
              },
            ],
            footer: {
              text: `${String(result.fetched)}件取得しました`,
            },
          }
          : {}),
      });
    } catch {
      await clearSyncCooldown(guildId);
      await sendFollowupEmbed(discordApplicationId, interactionToken, {
        title: "Webhook キャッシュの更新に失敗しました",
        description: "Bot に Manage Webhooks 権限があるか確認してください",
        color: EmbedColor.Error,
      });
    }
  })().catch(console.error);

  return deferredEphemeral();
};
