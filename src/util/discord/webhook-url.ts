import { hashString } from "../crypto.ts";

const DISCORD_WEBHOOK_HOSTS = new Set(["discord.com", "discordapp.com"]);
const DISCORD_SNOWFLAKE_PATTERN = /^[1-9]\d{16,18}$/;
const DISCORD_WEBHOOK_TOKEN_PATTERN = /^[A-Za-z0-9._-]{32,256}$/;

export class InvalidDiscordWebhookUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDiscordWebhookUrlError";
  }
}

export type DiscordWebhookHost = "discord.com" | "discordapp.com";

export type ParsedDiscordWebhookUrl = {
  url: string;
  origin: string;
  host: DiscordWebhookHost;
  webhookId: string;
  webhookToken: string;
};

export const parseDiscordWebhookUrl = (
  url: string,
): ParsedDiscordWebhookUrl => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new InvalidDiscordWebhookUrlError("Invalid Discord webhook URL");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new InvalidDiscordWebhookUrlError(
      "Discord webhook URL must use https",
    );
  }

  if (!DISCORD_WEBHOOK_HOSTS.has(parsedUrl.hostname)) {
    throw new InvalidDiscordWebhookUrlError(
      "Discord webhook URL host is not allowed",
    );
  }

  if (parsedUrl.port !== "") {
    throw new InvalidDiscordWebhookUrlError(
      "Discord webhook URL must not include a port",
    );
  }

  if (parsedUrl.username !== "" || parsedUrl.password !== "") {
    throw new InvalidDiscordWebhookUrlError(
      "Discord webhook URL must not include credentials",
    );
  }

  if (parsedUrl.search !== "" || parsedUrl.href.includes("?")) {
    throw new InvalidDiscordWebhookUrlError(
      "Discord webhook URL must not include a query string",
    );
  }

  if (parsedUrl.hash !== "" || parsedUrl.href.includes("#")) {
    throw new InvalidDiscordWebhookUrlError(
      "Discord webhook URL must not include a fragment",
    );
  }

  const pathParts = parsedUrl.pathname.split("/");
  if (pathParts.length !== 5) {
    throw new InvalidDiscordWebhookUrlError(
      "Discord webhook URL path must be /api/webhooks/:id/:token",
    );
  }

  const [, api, webhooks, webhookId, webhookToken] = pathParts;
  if (
    api !== "api" ||
    webhooks !== "webhooks" ||
    !DISCORD_SNOWFLAKE_PATTERN.test(webhookId) ||
    !DISCORD_WEBHOOK_TOKEN_PATTERN.test(webhookToken)
  ) {
    throw new InvalidDiscordWebhookUrlError(
      "Discord webhook URL path must be /api/webhooks/:id/:token",
    );
  }

  const host = parsedUrl.hostname as DiscordWebhookHost;
  const normalizedUrl =
    `${parsedUrl.origin}/api/webhooks/${webhookId}/${webhookToken}`;

  return {
    url: normalizedUrl,
    origin: parsedUrl.origin,
    host,
    webhookId,
    webhookToken,
  };
};

export const normalizeAndHashDiscordWebhookUrl = async (
  discordWebhookUrl: string,
): Promise<{ url: string; hash: string }> => {
  const parsedUrl = parseDiscordWebhookUrl(discordWebhookUrl);

  return {
    url: parsedUrl.url,
    hash: await hashString(parsedUrl.url),
  };
};
