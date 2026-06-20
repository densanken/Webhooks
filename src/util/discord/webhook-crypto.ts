import { type EncryptedString, encryptString } from "../crypto.ts";
import { normalizeAndHashDiscordWebhookUrl } from "./webhook-url.ts";

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
