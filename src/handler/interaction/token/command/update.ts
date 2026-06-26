import {
  type APIApplicationCommandSubcommandOption,
  type APIInteraction,
  type APIInteractionResponse,
  ApplicationCommandOptionType,
  ComponentType,
  TextInputStyle,
} from "discord-api-types/v10";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import { isAdmin, isGuildMatch, isOwner } from "../../permissions.ts";
import { noInputTokenUUIDEmbed, notFoundTokenEmbed } from "../embed.ts";
import { EmbedColor, ephemeralMessage, modalResponse } from "../../response.ts";
import { formatOwner } from "../../../../util/discord/interaction/format.ts";

export const TOKEN_UPDATE_SUBCOMMAND: APIApplicationCommandSubcommandOption = {
  name: "update",
  description: "Dynamic Webhook Token を更新する",
  type: ApplicationCommandOptionType.Subcommand,
  options: [
    {
      name: "token",
      description: "更新したい Token",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    },
    {
      name: "owner",
      description: "新しい運用担当者",
      type: ApplicationCommandOptionType.User,
      required: false,
    },
  ],
};

export const handleUpdate = async (
  options: Map<string, string | number | boolean>,
  interaction: APIInteraction,
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
      description:
        "現在の Token 運用担当者 または サーバー管理者のみが更新可能です",
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

  const ownerOption = options.get("owner") as string | undefined;
  const isChangeRequest = ownerOption &&
    detail.owner?.discordUserId !== ownerOption; // 同一オーナーへの変更を避ける
  const nonce = BigInt(interaction.id).toString(36);
  const customId = `webhook.token.update.modal:${uuid}:${
    isChangeRequest ? ownerOption : ""
  }:${nonce}`;

  return modalResponse({
    custom_id: customId,
    title: "Dynamic Webhook Token を更新する",
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: `description:${nonce}`,
            label: "この Token の利用目的",
            style: TextInputStyle.Paragraph,
            required: true,
            value: detail.description,
          },
        ],
      },
      ...(isChangeRequest
        ? [
          {
            type: ComponentType.TextDisplay as const,
            content: `### 運用担当者の変更\n${
              detail.owner ? formatOwner(detail.owner) : "運用担当者なし"
            } → <@${ownerOption}>`,
          },
          {
            type: ComponentType.Label as const,
            label: "運用担当者の変更に同意する",
            description: "運用担当者を変更するにはチェックが必要です。",
            component: {
              type: ComponentType.Checkbox as const,
              custom_id: "owner-change-consent",
            },
          },
        ]
        : []),
    ],
  });
};
