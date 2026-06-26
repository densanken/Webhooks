import {
  type APIApplicationCommandSubcommandOption,
  type APIInteraction,
  type APIInteractionResponse,
  ApplicationCommandOptionType,
  ComponentType,
  TextInputStyle,
} from "discord-api-types/v10";
import type { InteractionsDependencies } from "../../route.ts";
import { modalResponse } from "../../response.ts";

export const TOKEN_CREATE_SUBCOMMAND: APIApplicationCommandSubcommandOption = {
  name: "create",
  description: "Dynamic Webhook Token を作成する",
  type: ApplicationCommandOptionType.Subcommand,
};

export const handleCreate = (
  _interaction: APIInteraction,
  _deps: InteractionsDependencies,
): APIInteractionResponse =>
  modalResponse({
    custom_id: "webhook.token.create.modal",
    title: "Dynamic Webhook Token を作成する",
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: "description",
            label: "利用目的",
            style: TextInputStyle.Paragraph,
            required: true,
          },
        ],
      },
    ],
  });
