import {
  type APIApplicationCommandSubcommandGroupOption,
  type APIInteraction,
  type APIInteractionResponse,
  ApplicationCommandOptionType,
} from "discord-api-types/v10";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import type { CommandGroupEntry } from "../../commands.ts";
import { EmbedColor, ephemeralMessage } from "../../response.ts";
import { DISCORD_CREATE_SUBCOMMAND, handleCreate } from "./create.ts";
import { DISCORD_LIST_SUBCOMMAND, handleList } from "./list.ts";
import { DISCORD_SHOW_SUBCOMMAND, handleShow } from "./show.ts";
import { DISCORD_UPDATE_SUBCOMMAND, handleUpdate } from "./update.ts";
import { DISCORD_DELETE_SUBCOMMAND, handleDelete } from "./delete.ts";
import { DISCORD_SYNC_SUBCOMMAND, handleSync } from "./sync.ts";

const definition: APIApplicationCommandSubcommandGroupOption = {
  name: "discord",
  description: "Discord Webhook を管理",
  type: ApplicationCommandOptionType.SubcommandGroup,
  options: [
    DISCORD_CREATE_SUBCOMMAND,
    DISCORD_LIST_SUBCOMMAND,
    DISCORD_SHOW_SUBCOMMAND,
    DISCORD_UPDATE_SUBCOMMAND,
    DISCORD_DELETE_SUBCOMMAND,
    DISCORD_SYNC_SUBCOMMAND,
  ],
};

const handle = (
  subcommand: string,
  options: Map<string, string | number | boolean>,
  interaction: APIInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> | APIInteractionResponse => {
  switch (subcommand) {
    case "create":
      return handleCreate(interaction, deps);
    case "list":
      return handleList(interaction, deps, ctx);
    case "show":
      return handleShow(options, interaction, deps, ctx);
    case "update":
      return handleUpdate(options, interaction, deps, ctx);
    case "delete":
      return handleDelete(options, interaction, deps, ctx);
    case "sync":
      return handleSync(interaction, deps, ctx);
    default:
      return ephemeralMessage({
        title: "コマンドが存在しません",
        color: EmbedColor.Default,
        footer: {
          text: "Bot 管理者にお問い合わせください",
        },
      });
  }
};

export const discordCommand: CommandGroupEntry = { definition, handle };
