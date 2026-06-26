import {
  type APIApplicationCommandAutocompleteInteraction,
  ApplicationCommandOptionType,
} from "discord-api-types/v10";

export const extractFocusedValue = (
  interaction: APIApplicationCommandAutocompleteInteraction,
): string | undefined => {
  const group = interaction.data.options?.[0];
  if (!group || group.type !== ApplicationCommandOptionType.SubcommandGroup) {
    return undefined;
  }
  const sub = group.options?.[0];
  if (!sub || sub.type !== ApplicationCommandOptionType.Subcommand) {
    return undefined;
  }
  for (const opt of sub.options ?? []) {
    if ("focused" in opt && opt.focused) {
      return String(opt.value ?? "");
    }
  }
  return undefined;
};
