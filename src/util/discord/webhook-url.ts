const DISCORD_WEBHOOK_HOSTS = new Set(["discord.com", "discordapp.com"]);
const DISCORD_SNOWFLAKE_PATTERN = /^[1-9]\d{16,18}$/;
const DISCORD_WEBHOOK_TOKEN_PATTERN = /^[A-Za-z0-9._-]{32,256}$/;

const REDACTED_DISCORD_WEBHOOK_TOKEN = "<redacted>";
const INVALID_DISCORD_WEBHOOK_URL = "<invalid-discord-webhook-url>";

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
    throw new TypeError("Invalid Discord webhook URL");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new TypeError("Discord webhook URL must use https");
  }

  if (!DISCORD_WEBHOOK_HOSTS.has(parsedUrl.hostname)) {
    throw new TypeError("Discord webhook URL host is not allowed");
  }

  if (parsedUrl.port !== "") {
    throw new TypeError("Discord webhook URL must not include a port");
  }

  if (parsedUrl.username !== "" || parsedUrl.password !== "") {
    throw new TypeError("Discord webhook URL must not include credentials");
  }

  if (parsedUrl.search !== "" || parsedUrl.href.includes("?")) {
    throw new TypeError("Discord webhook URL must not include a query string");
  }

  if (parsedUrl.hash !== "" || parsedUrl.href.includes("#")) {
    throw new TypeError("Discord webhook URL must not include a fragment");
  }

  const pathParts = parsedUrl.pathname.split("/");
  if (pathParts.length !== 5) {
    throw new TypeError(
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
    throw new TypeError(
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

export const redactDiscordWebhookUrl = (url: string): string => {
  try {
    const parsedUrl = parseDiscordWebhookUrl(url);

    return `${parsedUrl.origin}/api/webhooks/${parsedUrl.webhookId}/${REDACTED_DISCORD_WEBHOOK_TOKEN}`;
  } catch {
    return INVALID_DISCORD_WEBHOOK_URL;
  }
};
