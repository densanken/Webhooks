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
import type { RegisteredDiscordWebhookDetail } from "../../../../usecase/discord/registered-webhook/interface.ts";
import {
  getUserAvatarUrl,
  getUserDisplayName,
} from "../../../../util/discord/interaction/format.ts";
import { isAdmin, isGuildMatch, isOwner } from "../../permissions.ts";
import {
  EmbedColor,
  ephemeralEmbed,
  ephemeralMessage,
  updateFromEmbed,
} from "../../response.ts";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import {
  noInputDiscordWebhookUUIDEmbed,
  notFoundDiscordWebhookEmbed,
} from "../embed.ts";

export const DISCORD_DELETE_SUBCOMMAND: APIApplicationCommandSubcommandOption =
  {
    name: "delete",
    description: "登録済み Discord Webhook を削除する",
    type: ApplicationCommandOptionType.Subcommand,
    options: [
      {
        name: "webhook",
        description: "削除したい Webhook",
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
    ],
  };

const deleteForbiddenEmbed = (uuid: string): APIEmbed => ({
  title: "指定した ID の Discord Webhook が見つかりませんでした",
  description: "Webhook 運用担当者 または サーバー管理者のみが削除可能です",
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

const createDeleteEmbed = (
  detail: RegisteredDiscordWebhookDetail,
  completed: boolean,
): APIEmbed => ({
  title: completed
    ? "Discord Webhook を削除しました"
    : "この Discord Webhook を本当に削除しますか？",
  color: completed ? EmbedColor.Success : EmbedColor.Default,
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
  ],
});

export const handleDelete = async (
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
          custom_id: `webhook.discord.delete.confirm:${uuid}`,
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          label: "キャンセル",
          custom_id: `webhook.discord.delete.cancel:${uuid}`,
        },
      ],
    },
  ]);
};

export const handleConfirmDiscordWebhookDelete = async (
  interaction: APIMessageComponentInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> => {
  const { custom_id: customId } = interaction.data;

  if (customId.startsWith("webhook.discord.delete.cancel:")) {
    const uuid = customId.replace("webhook.discord.delete.cancel:", "");

    return updateFromEmbed({
      title: "Discord Webhook の削除をキャンセルしました",
      color: EmbedColor.Default,
      fields: [
        {
          name: "キャンセルした Webhook ID",
          value: `\`${uuid}\``,
        },
      ],
    });
  }

  const uuid = customId.replace("webhook.discord.delete.confirm:", "");
  const { guildId, member } = ctx;
  const admin = isAdmin(member.permissions);

  const detail = await deps.registeredWebhookUseCase
    .getRegisteredDiscordWebhook(uuid);

  if (!detail) {
    return updateFromEmbed(notFoundDiscordWebhookEmbed("missing", uuid));
  }

  if (!isGuildMatch(guildId, detail.owner?.guildId)) {
    return updateFromEmbed(notFoundDiscordWebhookEmbed("guild-mismatch", uuid));
  }

  if (!admin && !isOwner(member.user.id, detail.owner?.discordUserId)) {
    return updateFromEmbed(deleteForbiddenEmbed(uuid));
  }

  const revoked = await deps.registeredWebhookUseCase
    .revokeRegisteredDiscordWebhook(uuid);

  if (!revoked) {
    return updateFromEmbed({
      title: "Discord Webhook を削除できませんでした",
      description:
        "`/webhook discord list` に存在しない場合は、すでに削除されている可能性があります",
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

  return updateFromEmbed(createDeleteEmbed(detail, true));
};
