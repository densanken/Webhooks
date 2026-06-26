import type { WebhookTokenRecord } from "../../repository/token/interface.ts";
import type { WebhookTokenSummary } from "./interface.ts";

export const toWebhookTokenSummary = (
  record: WebhookTokenRecord,
): WebhookTokenSummary => ({
  uuid: record.uuid,
  description: record.description ?? "",
  owner: record.owner,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});
