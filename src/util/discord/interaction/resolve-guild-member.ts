export const resolveGuildMember = async (
  botToken: string,
  guildId: string,
  userId: string,
): Promise<
  {
    username: string;
    globalName: string | null;
    displayName: string | null;
    avatarHash: string | null;
    discriminator: string;
  } | undefined
> => {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${
        encodeURIComponent(guildId)
      }/members/${encodeURIComponent(userId)}`,
      { headers: { authorization: `Bot ${botToken}` } },
    );
    if (!response.ok) return undefined;

    const member: {
      user?: {
        username: string;
        global_name?: string | null;
        avatar?: string | null;
        discriminator?: string;
      };
      nick?: string | null;
    } = await response.json();

    return {
      username: member.user?.username ?? userId,
      globalName: member.user?.global_name ?? null,
      displayName: member.nick ?? null,
      avatarHash: member.user?.avatar ?? null,
      discriminator: member.user?.discriminator ?? "0",
    };
  } catch {
    return undefined;
  }
};
