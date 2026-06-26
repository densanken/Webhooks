import {
  type APIApplicationCommandSubcommandGroupOption,
  type APIInteraction,
  type APIInteractionResponse,
  ApplicationCommandOptionType,
} from "discord-api-types/v10";
import type { GuildContext, InteractionsDependencies } from "./route.ts";

export type CommandGroupEntry = {
  definition: APIApplicationCommandSubcommandGroupOption;
  handle: (
    subcommand: string,
    options: Map<string, string | number | boolean>,
    interaction: APIInteraction,
    deps: InteractionsDependencies,
    ctx: GuildContext,
  ) => Promise<APIInteractionResponse> | APIInteractionResponse;
};

export type ResolvedCommand = {
  group: string;
  subcommand: string;
  options: Map<string, string | number | boolean>;
};

type CommandOption = {
  type: number;
  name: string;
  value?: string | number | boolean;
  options?: CommandOption[];
};

export const resolveCommand = (
  data: { options?: CommandOption[] },
): ResolvedCommand | null => {
  const topOption = data.options?.[0];
  if (
    !topOption ||
    topOption.type !== ApplicationCommandOptionType.SubcommandGroup
  ) {
    return null;
  }

  const subcommandOption = topOption.options?.[0];
  if (
    !subcommandOption ||
    subcommandOption.type !== ApplicationCommandOptionType.Subcommand
  ) {
    return null;
  }

  const options = new Map<string, string | number | boolean>();
  for (const opt of subcommandOption.options ?? []) {
    if (opt.value !== undefined) {
      options.set(opt.name, opt.value);
    }
  }

  return {
    group: topOption.name,
    subcommand: subcommandOption.name,
    options,
  };
};
