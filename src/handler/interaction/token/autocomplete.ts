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

export const handleWebhookTokenAutocomplete = async (
  interaction: APIApplicationCommandAutocompleteInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> => {
  const { guildId, member } = ctx;
  const admin = isAdmin(member.permissions);

  const focusedValue = extractFocusedValue(interaction)?.toLowerCase() ?? "";
  const uuidSearch = focusedValue.length > 0 && UUID_LIKE.test(focusedValue);

  const tokens = await deps.tokenUseCase
    .listDynamicWebhookTokensByGuild(guildId);

  const filtered =
    (admin
      ? tokens
      : tokens.filter((t) => t.owner?.discordUserId === member.user.id))
      .filter((t) =>
        t.uuid.toLowerCase().includes(focusedValue) ||
        t.description.toLowerCase().includes(focusedValue) ||
        (t.owner ? getUserDisplayName(t.owner) : "").toLowerCase().includes(
          focusedValue,
        )
      )
      .slice(0, MAX_CHOICES);

  const choices: APIApplicationCommandOptionChoice<string>[] = filtered.map(
    (t) => ({
      name: (uuidSearch ? `${t.uuid} — ${t.description}` : t.description).slice(
        0,
        100,
      ),
      value: t.uuid,
    }),
  );

  return {
    type: InteractionResponseType.ApplicationCommandAutocompleteResult,
    data: { choices },
  };
};
