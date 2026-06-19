import type {
  RegisteredDiscordWebhookRecord,
  RegisteredDiscordWebhookSummaryRecord,
} from "../../../repository/discord/registered-webhook/interface.ts";
import type {
  RegisteredDiscordWebhookDetail,
  RegisteredDiscordWebhookSummary,
} from "./interface.ts";

export const toRegisteredDiscordWebhookSummary = (
  record: RegisteredDiscordWebhookSummaryRecord,
): RegisteredDiscordWebhookSummary => ({
  uuid: record.uuid,
  description: record.description,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export const toRegisteredDiscordWebhookDetail = (
  input: {
    record: RegisteredDiscordWebhookRecord;
    publicBaseUrl?: string;
  },
): RegisteredDiscordWebhookDetail => ({
  ...toRegisteredDiscordWebhookSummary(input.record),
  webhookUrl: buildPublicWebhookUrl(
    input.publicBaseUrl,
    input.record.uuid,
    input.record.pathToken,
  ),
  discordWebhookUrl: input.record.discordWebhookUrl,
});

const buildPublicWebhookUrl = (
  publicBaseUrl: string | undefined,
  uuid: string,
  token: string,
): string => {
  const path = `/discord/webhooks/${encodeURIComponent(uuid)}/${
    encodeURIComponent(token)
  }`;
  if (publicBaseUrl === undefined || publicBaseUrl === "") return path;

  return `${publicBaseUrl.replace(/\/+$/, "")}${path}`;
};
