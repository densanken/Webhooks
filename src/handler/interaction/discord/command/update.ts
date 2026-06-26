import {
  type APIApplicationCommandSubcommandOption,
  type APIInteraction,
  type APIInteractionResponse,
  ApplicationCommandOptionType,
  ComponentType,
  TextInputStyle,
} from "discord-api-types/v10";
import { isAdmin, isGuildMatch, isOwner } from "../../permissions.ts";
import { EmbedColor, ephemeralMessage, modalResponse } from "../../response.ts";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import {
  noInputDiscordWebhookUUIDEmbed,
  notFoundDiscordWebhookEmbed,
} from "../embed.ts";
import { formatOwner } from "../../../../util/discord/interaction/format.ts";

export const DISCORD_UPDATE_SUBCOMMAND: APIApplicationCommandSubcommandOption =
  {
    name: "update",
    description: "登録済み Discord Webhook を更新する",
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      {
        name: "webhook",
        description: "更新したい Webhook",
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

  const ownerOption = options.get("owner") as string | undefined;
  const isChangeRequest = ownerOption &&
    detail.owner?.discordUserId !== ownerOption; // 同一オーナーへの変更を避ける
  const nonce = BigInt(interaction.id).toString(36);
  const customId = `webhook.discord.update.modal:${uuid}:${
    isChangeRequest ? ownerOption : ""
  }:${nonce}`;

  return modalResponse({
    custom_id: customId,
    title: "Discord Webhook を更新する",
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: `description:${nonce}`,
            label: "この Webhook の利用目的",
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
