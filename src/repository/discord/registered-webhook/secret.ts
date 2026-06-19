import {
  registeredDiscordWebhookUrlLabel,
  registeredWebhookPathTokenLabel,
} from "../../../infrastructure/discord-webhook-secret.ts";
import { decryptString } from "../../../util/crypto.ts";
import type { RegisteredDiscordWebhookKvRecord } from "./record.ts";

export const decryptRegisteredDiscordWebhookUrl = (
  record: RegisteredDiscordWebhookKvRecord,
): Promise<string> =>
  decryptString(
    registeredDiscordWebhookUrlLabel(record.uuid),
    record.encryptedDiscordWebhookUrl,
  );

export const decryptRegisteredPathToken = (
  record: RegisteredDiscordWebhookKvRecord,
): Promise<string> =>
  decryptString(
    registeredWebhookPathTokenLabel(record.uuid),
    record.encryptedPathToken,
  );
