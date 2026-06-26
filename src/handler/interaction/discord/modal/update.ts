import {
  type APIInteractionResponse,
  type APIModalSubmitInteraction,
} from "discord-api-types/v10";
import type { DiscordResourceOwner } from "../../../../repository/discord/owner.ts";
import {
  extractModalBoolean,
  extractModalValue,
  extractModalValueByPrefix,
} from "../../../../util/discord/interaction/extract-modal-value.ts";
import {
  getUserAvatarUrl,
  getUserDisplayName,
} from "../../../../util/discord/interaction/format.ts";
import { resolveGuildMember } from "../../../../util/discord/interaction/resolve-guild-member.ts";
import { isAdmin, isGuildMatch, isOwner } from "../../permissions.ts";
import {
  EmbedColor,
  ephemeralEmbed,
  ephemeralMessage,
} from "../../response.ts";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import { notFoundDiscordWebhookEmbed } from "../embed.ts";
import { descriptionTooLongEmbed, isDescriptionTooLong } from "../../embed.ts";

export const handleUpdateDiscordWebhookModal = async (
  interaction: APIModalSubmitInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> => {
  const { custom_id: customId } = interaction.data;
  const parts = customId
    .replace("webhook.discord.update.modal:", "")
    .split(":");
  const uuid = parts[0];
  const newOwnerId = parts[1] || undefined;

  const { guildId, member } = ctx;
  const admin = isAdmin(member.permissions);

  const detail = await deps.registeredWebhookUseCase
    .getRegisteredDiscordWebhook(uuid);

  if (!detail) {
    return ephemeralMessage(notFoundDiscordWebhookEmbed("missing", uuid));
  }

  if (!isGuildMatch(guildId, detail.owner?.guildId)) {
    return ephemeralMessage(
      notFoundDiscordWebhookEmbed("guild-mismatch", uuid),
    );
  }

  if (!admin && !isOwner(member.user.id, detail.owner?.discordUserId)) {
    return ephemeralMessage({
      title: "指定した ID の Discord Webhook が見つかりませんでした",
      description:
        "現在の Webhook 運用担当者 または サーバー管理者のみが更新可能です",
      color: EmbedColor.Error,
      fields: [
        {
          name: "リクエストされた Webhook ID",
          value: `\`${uuid}\``,
        },
      ],
      footer: {
        text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
      },
    });
  }

  const description = (
    extractModalValueByPrefix(interaction, "description:") ??
      extractModalValue(interaction, "description")
  )?.trim();
  if (!description) {
    return ephemeralMessage({
      title: "利用目的を入力してください",
      color: EmbedColor.Error,
      footer: {
        text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
      },
    });
  }

  if (isDescriptionTooLong(description)) {
    return ephemeralMessage(descriptionTooLongEmbed(description));
  }

  if (
    newOwnerId &&
    extractModalBoolean(interaction, "owner-change-consent") !== true
  ) {
    return ephemeralMessage({
      title: "運用担当者変更への同意がありませんでした",
      description: "運用担当者を変更するには、変更内容への同意が必要です",
      color: EmbedColor.Error,
      footer: {
        text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
      },
    });
  }

  let newOwner: DiscordResourceOwner | undefined;
  if (newOwnerId) {
    let resolved;
    try {
      resolved = await resolveGuildMember(
        deps.env.discordBotToken,
        guildId,
        newOwnerId,
      );
    } catch {
      return ephemeralMessage({
        title: "運用担当者の情報を取得できませんでした",
        description:
          "Discord API との通信に失敗しました\nしばらく待ってから再度お試しください",
        color: EmbedColor.Error,
        footer: {
          text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
        },
      });
    }

    if (!resolved) {
      return ephemeralMessage({
        title: "指定された運用担当者が見つかりませんでした",
        description:
          "対象のユーザーがこのサーバーに参加しているか確認してください",
        color: EmbedColor.Error,
        footer: {
          text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
        },
      });
    }

    const { username, globalName, displayName, avatarHash, discriminator } =
      resolved;
    newOwner = {
      guildId,
      discordUserId: newOwnerId,
      username,
      globalName,
      displayName,
      avatarHash,
      discriminator,
    };
  }

  const updated = await deps.registeredWebhookUseCase
    .updateRegisteredDiscordWebhook(uuid, {
      description,
      owner: newOwner,
    });

  if (!updated) {
    return ephemeralEmbed({
      title: "Discord Webhook の更新に失敗しました",
      color: EmbedColor.Error,
      author: {
        name: detail.owner
          ? getUserDisplayName(detail.owner)
          : "運用担当者なし",
        icon_url: getUserAvatarUrl(detail.owner),
      },
      fields: [
        {
          name: "リクエストされた Webhook ID",
          value: `\`${uuid}\``,
        },
        {
          name: "利用目的",
          value: description,
        },
      ],
      footer: {
        text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
      },
    });
  }

  return ephemeralEmbed({
    title: "Discord Webhook を更新しました",
    color: EmbedColor.Success,
    author: {
      name: updated.owner
        ? getUserDisplayName(updated.owner)
        : "運用担当者なし",
      icon_url: getUserAvatarUrl(updated.owner),
    },
    fields: [
      {
        name: "Webhook ID",
        value: `\`${uuid}\``,
      },
      {
        name: "利用目的",
        value: updated.description,
      },
    ],
    timestamp: updated.updatedAt,
  });
};
