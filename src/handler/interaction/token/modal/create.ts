import {
  type APIInteractionResponse,
  type APIModalSubmitInteraction,
} from "discord-api-types/v10";
import type { DiscordResourceOwner } from "../../../../repository/discord/owner.ts";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import {
  EmbedColor,
  ephemeralEmbed,
  ephemeralMessage,
} from "../../response.ts";
import { extractModalValue } from "../../../../util/discord/interaction/extract-modal-value.ts";
import {
  getUserAvatarUrl,
  getUserDisplayName,
} from "../../../../util/discord/interaction/format.ts";
import { resolveGuildMember } from "../../../../util/discord/interaction/resolve-guild-member.ts";

export const handleCreateWebhookTokenModal = async (
  interaction: APIModalSubmitInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> => {
  const { guildId, member } = ctx;
  const { user } = member;
  const { custom_id: customId } = interaction.data;
  const ownerIdFromCustomId = customId === "webhook.token.create.modal"
    ? undefined
    : customId.replace("webhook.token.create.modal:", "");

  const description = extractModalValue(interaction, "description")?.trim();
  if (!description) {
    return ephemeralMessage({
      title: "利用目的を入力してください",
      color: EmbedColor.Error,
    });
  }

  let owner: DiscordResourceOwner = {
    guildId,
    discordUserId: user.id,
    username: user.username,
    globalName: user.global_name ?? null,
    displayName: member.nick ?? null,
    avatarHash: user.avatar ?? null,
    discriminator: user.discriminator ?? "0",
  };

  if (ownerIdFromCustomId) {
    const resolved = await resolveGuildMember(
      deps.env.discordBotToken,
      guildId,
      ownerIdFromCustomId,
    );
    if (resolved) {
      owner = {
        guildId,
        discordUserId: ownerIdFromCustomId,
        ...resolved,
      };
    }
  }

  const created = await deps.tokenUseCase.createDynamicWebhookToken({
    description,
    owner,
  });

  return ephemeralEmbed({
    title: "Dynamic Webhook Token を発行しました",
    color: EmbedColor.Success,
    author: {
      name: created.owner
        ? getUserDisplayName(created.owner)
        : "運用担当者なし",
      icon_url: getUserAvatarUrl(created.owner),
    },
    fields: [
      {
        name: "Token ID",
        value: `\`${created.uuid}\``,
      },
      {
        name: "利用目的",
        value: created.description,
      },
      {
        name: "Token （再表示できません）",
        value: `\`\`\`\n${created.token}\n\`\`\``,
      },
    ],
    timestamp: created.createdAt,
  });
};
