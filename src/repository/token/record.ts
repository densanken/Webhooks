import type { WebhookTokenRecord } from "./interface.ts";

export const createWebhookTokenRecord = (
  input: WebhookTokenRecord,
): WebhookTokenRecord => ({
  uuid: input.uuid,
  description: input.description,
  tokenHash: input.tokenHash,
  createdAt: input.createdAt,
  updatedAt: input.updatedAt,
});
