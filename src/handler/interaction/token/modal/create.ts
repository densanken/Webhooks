import {
  type APIInteractionResponse,
  type APIModalSubmitInteraction,
} from "discord-api-types/v10";
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

export const handleCreateWebhookTokenModal = async (
  interaction: APIModalSubmitInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> => {
  const { guildId, member } = ctx;
  const { user } = member;

  const description = extractModalValue(interaction, "description")?.trim();
  if (!description) {
    return ephemeralMessage({
      title: "利用目的を入力してください",
      color: EmbedColor.Error,
    });
  }

  const owner = {
    guildId,
    discordUserId: user.id,
    username: user.username,
    globalName: user.global_name ?? null,
    displayName: member.nick ?? null,
    avatarHash: user.avatar ?? null,
    discriminator: user.discriminator ?? "0",
  };

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
