import type { DiscordResourceOwner } from "../../../repository/discord/owner.ts";

const DISCORD_CDN_BASE = "https://cdn.discordapp.com";

export const getUserDisplayName = (owner: DiscordResourceOwner): string =>
  owner.displayName ?? owner.globalName ?? owner.username;

export const formatOwner = (owner?: { discordUserId: string }): string =>
  owner ? `<@${owner.discordUserId}>` : "不明";

const getDefaultAvatarIndex = (user: DiscordResourceOwner): number => {
  // 新 username 体系では discriminator が "0" になる
  // この場合、default avatar index は (user_id >> 22) % 6
  if (user.discriminator === "0") {
    return Number((BigInt(user.discordUserId) >> 22n) % 6n);
  }

  // 旧 username 体系では discriminator % 5
  return Number(user.discriminator) % 5;
};

export const getUserAvatarUrl = (
  user: DiscordResourceOwner | undefined,
  format?: "webp" | "png" | "jpg" | "jpeg" | "gif",
): string => {
  if (!user) return `${DISCORD_CDN_BASE}/embed/avatars/0.png`;

  if (!user.avatarHash) {
    const index = getDefaultAvatarIndex(user);
    return `${DISCORD_CDN_BASE}/embed/avatars/${index}.png`;
  }

  return `${DISCORD_CDN_BASE}/avatars/${user.discordUserId}/${user.avatarHash}.${
    format ?? "webp"
  }?size=256`;
};
