export type DiscordResourceOwner = {
  guildId: string;
  discordUserId: string;
  username: string;
  globalName: string | null;
  displayName: string | null;
  avatarHash: string | null;
  discriminator: string;
};
