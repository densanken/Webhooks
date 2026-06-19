import { parseDiscordWebhookUrl } from "../util/discord/webhook-url.ts";
import {
  type EncryptedString,
  encryptString,
  hashString,
} from "../util/crypto.ts";

export type { EncryptedString };

export type NormalizedDiscordWebhookSecret = {
  url: string;
  hash: string;
  encryptedUrl: EncryptedString;
};

export const registeredDiscordWebhookUrlLabel = (uuid: string): string =>
  `registered-discord-webhook-url:${uuid}`;

export const registeredWebhookPathTokenLabel = (uuid: string): string =>
  `registered-webhook-path-token:discord:${uuid}`;

export const queueDiscordWebhookUrlLabel = (messageId: string): string =>
  `queue-discord-webhook-url:${messageId}`;

export const normalizeAndHashDiscordWebhookUrl = async (
  discordWebhookUrl: string,
): Promise<{ url: string; hash: string }> => {
  const parsedUrl = parseDiscordWebhookUrl(discordWebhookUrl);

  return {
    url: parsedUrl.url,
    hash: await hashString(parsedUrl.url),
  };
};

export const normalizeAndEncryptDiscordWebhookUrl = async (
  label: string,
  discordWebhookUrl: string,
): Promise<NormalizedDiscordWebhookSecret> => {
  const { url, hash } = await normalizeAndHashDiscordWebhookUrl(
    discordWebhookUrl,
  );

  return {
    url,
    hash,
    encryptedUrl: await encryptString(label, url),
  };
};
