import {
  type APIApplicationCommandAutocompleteInteraction,
  type APIApplicationCommandOptionChoice,
  type APIInteractionResponse,
  InteractionResponseType,
} from "discord-api-types/v10";
import type { GuildContext, InteractionsDependencies } from "../route.ts";
import { isAdmin } from "../permissions.ts";
import { extractFocusedValue } from "../../../util/discord/interaction/extract-focused-value.ts";
import { getUserDisplayName } from "../../../util/discord/interaction/format.ts";

const MAX_CHOICES = 25;
const UUID_LIKE = /^[0-9a-f-]+$/;

export const handleDiscordWebhookAutocomplete = async (
  interaction: APIApplicationCommandAutocompleteInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> => {
  const { guildId, member } = ctx;
  const admin = isAdmin(member.permissions);

  const focusedValue = extractFocusedValue(interaction)?.toLowerCase() ?? "";
  const uuidSearch = focusedValue.length > 0 && UUID_LIKE.test(focusedValue);

  const webhooks = await deps.registeredWebhookUseCase
    .listRegisteredDiscordWebhooksByGuild(guildId);

  const filtered =
    (admin
      ? webhooks
      : webhooks.filter((w) => w.owner?.discordUserId === member.user.id))
      .filter((w) =>
        w.uuid.toLowerCase().includes(focusedValue) ||
        w.description.toLowerCase().includes(focusedValue) ||
        (w.owner ? getUserDisplayName(w.owner) : "").toLowerCase().includes(
          focusedValue,
        )
      )
      .slice(0, MAX_CHOICES);

  const choices: APIApplicationCommandOptionChoice<string>[] = filtered.map(
    (w) => ({
      name: (uuidSearch ? `${w.uuid} — ${w.description}` : w.description).slice(
        0,
        100,
      ),
      value: w.uuid,
    }),
  );

  return {
    type: InteractionResponseType.ApplicationCommandAutocompleteResult,
    data: { choices },
  };
};
