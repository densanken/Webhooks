import {
  type APIApplicationCommandSubcommandOption,
  type APIEmbed,
  type APIInteraction,
  type APIInteractionResponse,
  type APIMessageComponentInteraction,
  ApplicationCommandOptionType,
  ButtonStyle,
  ComponentType,
} from "discord-api-types/v10";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import { isAdmin, isGuildMatch, isOwner } from "../../permissions.ts";
import type { WebhookTokenSummary } from "../../../../usecase/token/interface.ts";
import {
  EmbedColor,
  ephemeralEmbed,
  ephemeralMessage,
  updateFromEmbed,
} from "../../response.ts";
import { noInputTokenUUIDEmbed, notFoundTokenEmbed } from "../embed.ts";
import {
  getUserAvatarUrl,
  getUserDisplayName,
} from "../../../../util/discord/interaction/format.ts";

export const TOKEN_DELETE_SUBCOMMAND: APIApplicationCommandSubcommandOption = {
  name: "delete",
  description: "Dynamic Webhook Token を削除する",
  type: ApplicationCommandOptionType.Subcommand,
  options: [
    {
      name: "token",
      description: "削除したい Token",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    },
  ],
};

const deleteForbiddenEmbed = (uuid: string): APIEmbed => ({
  title: "指定した ID の Token が見つかりませんでした",
  description: "Token 運用担当者 または サーバー管理者のみが削除可能です",
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

const createDeleteEmbed = (
  token: WebhookTokenSummary,
  completed: boolean,
): APIEmbed => ({
  title: completed
    ? "Dynamic Webhook Token を削除しました"
    : "この Dynamic Webhook Token を削除しますか？",
  color: completed ? EmbedColor.Success : EmbedColor.Default,
  author: {
    name: token.owner ? getUserDisplayName(token.owner) : "運用担当者なし",
    icon_url: getUserAvatarUrl(token.owner),
  },
  fields: [
    {
      name: "Token ID",
      value: `\`${token.uuid}\``,
    },
    {
      name: "利用目的",
      value: token.description,
    },
  ],
});

export const handleDelete = async (
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
    return ephemeralMessage(deleteForbiddenEmbed(uuid));
  }

  return ephemeralEmbed(createDeleteEmbed(detail, false), [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          style: ButtonStyle.Danger,
          label: "削除する",
          custom_id: `webhook.token.delete.confirm:${uuid}`,
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          label: "キャンセル",
          custom_id: `webhook.token.delete.cancel:${uuid}`,
        },
      ],
    },
  ]);
};

export const handleConfirmWebhookTokenDelete = async (
  interaction: APIMessageComponentInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> => {
  const { custom_id: customId } = interaction.data;

  if (customId.startsWith("webhook.token.delete.cancel:")) {
    const uuid = customId.replace("webhook.token.delete.cancel:", "");

    return updateFromEmbed({
      title: "Token の削除をキャンセルしました",
      color: EmbedColor.Default,
      fields: [
        {
          name: "キャンセルした Token ID",
          value: `\`${uuid}\``,
        },
      ],
    });
  }

  const uuid = customId.replace("webhook.token.delete.confirm:", "");
  const { guildId, member } = ctx;
  const admin = isAdmin(member.permissions);

  const detail = await deps.tokenUseCase.getDynamicWebhookToken(uuid);

  if (!detail) {
    return updateFromEmbed(notFoundTokenEmbed("missing", uuid));
  }

  if (!isGuildMatch(guildId, detail.owner?.guildId)) {
    return updateFromEmbed(notFoundTokenEmbed("guild-mismatch", uuid));
  }

  if (!admin && !isOwner(member.user.id, detail.owner?.discordUserId)) {
    return updateFromEmbed(deleteForbiddenEmbed(uuid));
  }

  const revoked = await deps.tokenUseCase.revokeDynamicWebhookToken(uuid);

  if (!revoked) {
    return updateFromEmbed({
      title: "Dynamic Webhook Token を削除できませんでした",
      description:
        "`/webhook token list` に存在しない場合は、すでに削除されている可能性があります",
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

  return updateFromEmbed(createDeleteEmbed(detail, true));
};
