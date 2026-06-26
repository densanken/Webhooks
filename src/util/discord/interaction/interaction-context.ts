import type { APIInteraction } from "discord-api-types/v10";

export const getGuildId = (interaction: APIInteraction): string =>
  "guild_id" in interaction ? interaction.guild_id! : "";

export const getMemberPermissions = (
  interaction: APIInteraction,
): string | undefined =>
  "member" in interaction ? interaction.member?.permissions : undefined;

export const getMemberId = (interaction: APIInteraction): string =>
  "member" in interaction ? interaction.member?.user?.id ?? "" : "";
