import {
  type APIApplicationCommandSubcommandGroupOption,
  type APIInteraction,
  type APIInteractionResponse,
  ApplicationCommandOptionType,
} from "discord-api-types/v10";
import type { GuildContext, InteractionsDependencies } from "../../route.ts";
import type { CommandGroupEntry } from "../../commands.ts";
import { EmbedColor, ephemeralMessage } from "../../response.ts";
import { handleCreate, TOKEN_CREATE_SUBCOMMAND } from "./create.ts";
import { handleList, TOKEN_LIST_SUBCOMMAND } from "./list.ts";
import { handleShow, TOKEN_SHOW_SUBCOMMAND } from "./show.ts";
import { handleUpdate, TOKEN_UPDATE_SUBCOMMAND } from "./update.ts";
import { handleDelete, TOKEN_DELETE_SUBCOMMAND } from "./delete.ts";

const definition: APIApplicationCommandSubcommandGroupOption = {
  name: "token",
  description: "Dynamic Webhook Token を管理",
  type: ApplicationCommandOptionType.SubcommandGroup,
  options: [
    TOKEN_CREATE_SUBCOMMAND,
    TOKEN_LIST_SUBCOMMAND,
    TOKEN_SHOW_SUBCOMMAND,
    TOKEN_UPDATE_SUBCOMMAND,
    TOKEN_DELETE_SUBCOMMAND,
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

export const tokenCommand: CommandGroupEntry = { definition, handle };
