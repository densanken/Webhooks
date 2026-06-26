import {
  type APIApplicationCommandSubcommandOption,
  type APIEmbed,
  type APIInteraction,
  type APIInteractionResponse,
  type APIMessageComponentInteraction,
  ApplicationCommandOptionType,
} from "discord-api-types/v10";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import { isAdmin } from "../../permissions.ts";

import {
  EmbedColor,
  ephemeralEmbed,
  ephemeralMessage,
  updateFromEmbed,
} from "../../response.ts";
import { formatOwner } from "../../../../util/discord/interaction/format.ts";
import {
  createPaginationComponents,
  getPage,
  parseRequestedPage,
  sortByUpdatedAtDescending,
} from "../../pagination.ts";

export const DISCORD_LIST_SUBCOMMAND: APIApplicationCommandSubcommandOption = {
  name: "list",
  description: "登録済み Discord Webhook の一覧を表示する",
  type: ApplicationCommandOptionType.Subcommand,
};

const PAGE_CUSTOM_ID = "webhook.discord.list.page";

const createListResponse = async (
  deps: InteractionsDependencies,
  ctx: GuildContext,
  requestedPage: number,
  update: boolean,
): Promise<APIInteractionResponse> => {
  const { guildId, member } = ctx;
  const admin = isAdmin(member.permissions);

  const webhooks = await deps.registeredWebhookUseCase
    .listRegisteredDiscordWebhooksByGuild(guildId);

  const filtered = admin
    ? webhooks
    : webhooks.filter((w) => w.owner?.discordUserId === member.user.id);
  const sorted = sortByUpdatedAtDescending(filtered);

  if (sorted.length === 0) {
    const embed: APIEmbed = {
      title: "登録済みの Discord Webhook はありません",
      description: "`/webhook discord create` で登録してください",
      color: EmbedColor.Default,
    };
    return update ? updateFromEmbed(embed) : ephemeralMessage(embed);
  }

  const page = getPage(sorted.length, requestedPage);
  const info = sorted.slice(page.start, page.end).map(
    (webhook) =>
      `### ID: \`${webhook.uuid}\`\n\n
    運用担当者: ${formatOwner(webhook.owner)}
    \`\`\`\n${webhook.description}\n\`\`\``,
  );

  const embed: APIEmbed = {
    title: "登録済み Discord Webhook",
    description: info.join("\n"),
    color: EmbedColor.Default,
    ...(page.count > 1
      ? { footer: { text: `${page.index + 1} / ${page.count}` } }
      : {}),
  };
  const components = createPaginationComponents(PAGE_CUSTOM_ID, page);

  return update
    ? updateFromEmbed(embed, components)
    : ephemeralEmbed(embed, components);
};

export const handleList = (
  _interaction: APIInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> => createListResponse(deps, ctx, 0, false);

export const handleListPage = (
  interaction: APIMessageComponentInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> =>
  createListResponse(
    deps,
    ctx,
    parseRequestedPage(interaction.data.custom_id, PAGE_CUSTOM_ID),
    true,
  );
