import {
  type APIApplicationCommandSubcommandOption,
  type APIInteraction,
  type APIInteractionResponse,
  ApplicationCommandOptionType,
} from "discord-api-types/v10";
import {
  getUserAvatarUrl,
  getUserDisplayName,
} from "../../../../util/discord/interaction/format.ts";
import { isAdmin, isGuildMatch, isOwner } from "../../permissions.ts";
import {
  EmbedColor,
  ephemeralEmbed,
  ephemeralMessage,
} from "../../response.ts";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import {
  noInputDiscordWebhookUUIDEmbed,
  notFoundDiscordWebhookEmbed,
} from "../embed.ts";

export const DISCORD_SHOW_SUBCOMMAND: APIApplicationCommandSubcommandOption = {
  name: "show",
  description: "登録済み Discord webhook の詳細を表示する",
  type: ApplicationCommandOptionType.Subcommand,
  options: [
    {
      name: "webhook",
      description: "詳細を表示したい Webhook",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    },
  ],
};

export const handleShow = async (
  options: Map<string, string | number | boolean>,
  _interaction: APIInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> => {
  const uuid = options.get("webhook") as string | undefined;
  if (!uuid) {
    return ephemeralMessage(noInputDiscordWebhookUUIDEmbed);
  }

  const detail = await deps.registeredWebhookUseCase
    .getRegisteredDiscordWebhook(uuid);

  if (!detail) {
    return ephemeralMessage(notFoundDiscordWebhookEmbed("missing", uuid));
  }

  const { guildId, member } = ctx;

  if (!isGuildMatch(guildId, detail.owner?.guildId)) {
    return ephemeralMessage(
      notFoundDiscordWebhookEmbed("guild-mismatch", uuid),
    );
  }

  const admin = isAdmin(member.permissions);
  if (!admin && !isOwner(member.user.id, detail.owner?.discordUserId)) {
    return ephemeralMessage({
      title: "指定した ID の Discord Webhook が見つかりませんでした",
      description: "Webhook 運用担当者 または サーバー管理者のみが閲覧可能です",
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

  return ephemeralEmbed({
    title: "登録済みの Discord Webhook 情報",
    color: EmbedColor.Default,
    author: {
      name: detail.owner ? getUserDisplayName(detail.owner) : "運用担当者なし",
      icon_url: getUserAvatarUrl(detail.owner),
    },
    fields: [
      {
        name: "Webhook ID",
        value: `\`${detail.uuid}\``,
      },
      {
        name: "利用目的",
        value: detail.description,
      },
      {
        name: "Webhook URL （この URL を利用してください）",
        value: `\`\`\`\n${detail.webhookUrl}\n\`\`\``,
      },
      {
        name: "Discord Webhook URL",
        value: `\`${detail.discordWebhookUrl}\``,
      },
    ],
    footer: {
      text: '送信には "Webhook URL" を用いてください',
    },
    timestamp: detail.updatedAt,
  });
};
