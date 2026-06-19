import {
  queueDiscordWebhookUrlLabel,
} from "../../../infrastructure/discord-webhook-secret.ts";
import { decryptString } from "../../../util/crypto.ts";
import type { QueuedDiscordMessageKvRecord } from "./record.ts";

export const decryptQueuedDiscordWebhookUrl = (
  record: QueuedDiscordMessageKvRecord,
): Promise<string> =>
  decryptString(
    queueDiscordWebhookUrlLabel(record.id),
    record.encryptedDiscordWebhookUrl,
  );
