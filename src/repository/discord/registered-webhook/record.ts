import type { EncryptedString } from "../../../util/crypto.ts";
import type { DiscordResourceOwner } from "../owner.ts";
import type {
  RegisteredDiscordWebhookRecord,
  RegisteredDiscordWebhookSummaryRecord,
} from "./interface.ts";

export type RegisteredDiscordWebhookKvRecord = {
  uuid: string;
  description?: string;
  owner?: DiscordResourceOwner;
  encryptedDiscordWebhookUrl: EncryptedString;
  discordWebhookUrlHash: string;
  encryptedPathToken: EncryptedString;
  createdAt: string;
  updatedAt: string;
};

export const createRegisteredDiscordWebhookKvRecord = (
  input: RegisteredDiscordWebhookKvRecord,
): RegisteredDiscordWebhookKvRecord => ({
  uuid: input.uuid,
  description: input.description,
  owner: input.owner,
  encryptedDiscordWebhookUrl: input.encryptedDiscordWebhookUrl,
  discordWebhookUrlHash: input.discordWebhookUrlHash,
  encryptedPathToken: input.encryptedPathToken,
  createdAt: input.createdAt,
  updatedAt: input.updatedAt,
});

export const toRegisteredDiscordWebhookSummaryRecord = (
  record: RegisteredDiscordWebhookSummaryRecord,
): RegisteredDiscordWebhookSummaryRecord => ({
  uuid: record.uuid,
  description: record.description,
  owner: record.owner,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export const toRegisteredDiscordWebhookRecord = (
  input: {
    record: RegisteredDiscordWebhookKvRecord;
    discordWebhookUrl: string;
    pathToken: string;
  },
): RegisteredDiscordWebhookRecord => ({
  ...toRegisteredDiscordWebhookSummaryRecord(input.record),
  discordWebhookUrl: input.discordWebhookUrl,
  discordWebhookUrlHash: input.record.discordWebhookUrlHash,
  pathToken: input.pathToken,
});
