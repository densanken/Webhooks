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

export const TOKEN_LIST_SUBCOMMAND: APIApplicationCommandSubcommandOption = {
  name: "list",
  description: "Dynamic Webhook Token の一覧を表示する",
  type: ApplicationCommandOptionType.Subcommand,
};

const PAGE_CUSTOM_ID = "webhook.token.list.page";

const createListResponse = async (
  deps: InteractionsDependencies,
  ctx: GuildContext,
  requestedPage: number,
  update: boolean,
): Promise<APIInteractionResponse> => {
  const { guildId, member } = ctx;
  const admin = isAdmin(member.permissions);

  const tokens = await deps.tokenUseCase
    .listDynamicWebhookTokensByGuild(guildId);

  const filtered = admin
    ? tokens
    : tokens.filter((t) => t.owner?.discordUserId === member.user.id);
  const sorted = sortByUpdatedAtDescending(filtered);

  if (sorted.length === 0) {
    const embed: APIEmbed = {
      title: "発行済みの Dynamic Webhook Token はありません",
      description: "`/webhook token create` で発行してください",
      color: EmbedColor.Default,
    };
    return update ? updateFromEmbed(embed) : ephemeralMessage(embed);
  }

  const page = getPage(sorted.length, requestedPage);
  const info = sorted.slice(page.start, page.end).map(
    (token) =>
      `### ID: \`${token.uuid}\`\n\n
    運用担当者: ${formatOwner(token.owner)}
    \`\`\`\n${token.description}\n\`\`\``,
  );

  const embed: APIEmbed = {
    title: "発行済み Dynamic Webhook Tokens",
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
