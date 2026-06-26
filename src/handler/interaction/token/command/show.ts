import {
  type APIApplicationCommandSubcommandOption,
  type APIInteraction,
  type APIInteractionResponse,
  ApplicationCommandOptionType,
} from "discord-api-types/v10";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import { isAdmin, isGuildMatch, isOwner } from "../../permissions.ts";
import {
  EmbedColor,
  ephemeralEmbed,
  ephemeralMessage,
} from "../../response.ts";
import { noInputTokenUUIDEmbed, notFoundTokenEmbed } from "../embed.ts";
import {
  getUserAvatarUrl,
  getUserDisplayName,
} from "../../../../util/discord/interaction/format.ts";

export const TOKEN_SHOW_SUBCOMMAND: APIApplicationCommandSubcommandOption = {
  name: "show",
  description: "Dynamic Webhook Token の詳細を表示する",
  type: ApplicationCommandOptionType.Subcommand,
  options: [
    {
      name: "token",
      description: "詳細を表示したい Token",
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
  const uuid = options.get("token") as string | undefined;
  if (!uuid) {
    return ephemeralMessage(noInputTokenUUIDEmbed);
  }

  const detail = await deps.tokenUseCase.getDynamicWebhookToken(uuid);

  if (!detail) {
    return ephemeralMessage(notFoundTokenEmbed("missing", uuid));
  }

  const { guildId, member } = ctx;

  if (!isGuildMatch(guildId, detail.owner?.guildId)) {
    return ephemeralMessage(notFoundTokenEmbed("guild-mismatch", uuid));
  }

  const admin = isAdmin(member.permissions);
  if (!admin && !isOwner(member.user.id, detail.owner?.discordUserId)) {
    return ephemeralMessage({
      title: "指定した ID の Token が見つかりませんでした",
      description: "Token 運用担当者 または サーバー管理者のみが閲覧可能です",
      color: EmbedColor.Error,
      fields: [
        {
          name: "リクエストされた Token ID",
          value: `\`${uuid}\``,
        },
      ],
      footer: {
        text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
      },
    });
  }

  return ephemeralEmbed({
    title: "発行済みの Dynamic Webhook Token 情報",
    color: EmbedColor.Default,
    author: {
      name: detail.owner ? getUserDisplayName(detail.owner) : "運用担当者なし",
      icon_url: getUserAvatarUrl(detail.owner),
    },
    fields: [
      {
        name: "Token ID",
        value: `\`${detail.uuid}\``,
      },
      {
        name: "利用目的",
        value: detail.description,
      },
    ],
    timestamp: detail.updatedAt,
  });
};
