import {
  type APIInteractionResponse,
  type APIModalSubmitInteraction,
} from "discord-api-types/v10";
import { extractModalValue } from "../../../../util/discord/interaction/extract-modal-value.ts";
import {
  getUserAvatarUrl,
  getUserDisplayName,
} from "../../../../util/discord/interaction/format.ts";
import {
  InvalidDiscordWebhookUrlError,
  parseDiscordWebhookUrl,
} from "../../../../util/discord/webhook-url.ts";
import {
  EmbedColor,
  ephemeralEmbed,
  ephemeralMessage,
} from "../../response.ts";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import { descriptionTooLongEmbed, isDescriptionTooLong } from "../../embed.ts";

export const handleCreateDiscordWebhookModal = async (
  interaction: APIModalSubmitInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> => {
  const { guildId, member } = ctx;

  const url = extractModalValue(interaction, "url")?.trim();
  const description = extractModalValue(interaction, "description")?.trim();

  if (!url || !description) {
    return ephemeralMessage({
      title: "すべての項目を入力してください",
      color: EmbedColor.Error,
    });
  }

  if (isDescriptionTooLong(description)) {
    return ephemeralMessage(descriptionTooLongEmbed(description));
  }

  let parsed;
  try {
    parsed = parseDiscordWebhookUrl(url);
  } catch (e) {
    if (e instanceof InvalidDiscordWebhookUrlError) {
      return ephemeralMessage({
        title: "Discord Webhook URL を入力してください",
        description:
          "次の形式の URL を入力する必要があります\n`https://discord.com/api/webhooks/...`",
        color: EmbedColor.Error,
        fields: [
          {
            name: "あなたが入力した URL",
            value: `\`${url}\``,
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
    throw e;
  }

  const isGuildWebhook = await deps.guildWebhooksUseCase
    .isGuildWebhookWithRefresh(
      guildId,
      parsed.webhookId,
    );

  if (!isGuildWebhook) {
    return ephemeralMessage({
      title: "他サーバーの Webhook は登録できません",
      description:
        "Discord Webhook はこのサーバーのものである必要があります\n### 他サーバーの URL でない場合\n\n`/webhook discord sync` を実行後、再度お試しください",
      color: EmbedColor.Error,
      fields: [
        {
          name: "あなたが入力した URL",
          value: `\`${url}\``,
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

  const { user } = member;

  const created = await deps.registeredWebhookUseCase
    .createRegisteredDiscordWebhook({
      discordWebhookUrl: url,
      description,
      owner: {
        guildId,
        discordUserId: user.id,
        username: user.username,
        globalName: user.global_name ?? null,
        displayName: member.nick ?? null,
        avatarHash: user.avatar ?? null,
        discriminator: user.discriminator ?? "0",
      },
    });

  return ephemeralEmbed({
    title: "Discord Webhook を登録しました",
    color: EmbedColor.Success,
    author: {
      name: created.owner
        ? getUserDisplayName(created.owner)
        : "運用担当者なし",
      icon_url: getUserAvatarUrl(created.owner),
    },
    fields: [
      {
        name: "Webhook ID",
        value: `\`${created.uuid}\``,
      },
      {
        name: "利用目的",
        value: created.description,
      },
      {
        name: "Webhook URL （この URL を利用してください）",
        value: `\`\`\`\n${created.webhookUrl}\n\`\`\``,
      },
      {
        name: "Discord Webhook URL",
        value: `\`${created.discordWebhookUrl}\``,
      },
    ],
    footer: {
      text: '送信には "Webhook URL" を用いてください',
    },
    timestamp: created.createdAt,
  });
};
