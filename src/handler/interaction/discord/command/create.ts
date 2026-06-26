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

export const DISCORD_CREATE_SUBCOMMAND: APIApplicationCommandSubcommandOption =
  {
    name: "create",
    description: "Discord Webhook を登録する",
    type: ApplicationCommandOptionType.Subcommand,
  };

export const handleCreate = (
  _interaction: APIInteraction,
  _deps: InteractionsDependencies,
): APIInteractionResponse =>
  modalResponse({
    custom_id: "webhook.discord.create.modal",
    title: "Discord Webhook を登録する",
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: "url",
            label: "Discord Webhook URL",
            style: TextInputStyle.Short,
            required: true,
            placeholder: "https://discord.com/api/webhooks/...",
          },
        ],
      },
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: "description",
            label: "この Webhook の利用目的",
            style: TextInputStyle.Paragraph,
            required: true,
            placeholder: "〇〇フォームの通知用",
          },
        ],
      },
    ],
  });
