import { PermissionFlagsBits } from "discord-api-types/v10";

export const isAllowedGuild = (
  guildId: string | undefined,
  allowedGuildIds: string[],
): boolean => {
  if (!guildId) return false;
  return allowedGuildIds.includes(guildId);
};

export const isAdmin = (permissions: string | undefined): boolean => {
  if (!permissions) return false;
  return (
    (BigInt(permissions) & BigInt(PermissionFlagsBits.Administrator)) !== 0n
  );
};

export const isOwner = (
  discordId: string,
  ownerDiscordId: string | undefined,
): boolean => {
  if (!ownerDiscordId) return false;
  return discordId === ownerDiscordId;
};

export const isGuildMatch = (
  guildId: string,
  ownerGuildId: string | undefined,
): boolean => {
  if (!ownerGuildId) return false;
  return guildId === ownerGuildId;
};
