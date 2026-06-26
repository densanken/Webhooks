import type { DiscordResourceOwner } from "../discord/owner.ts";

export type WebhookTokenRecord = {
  uuid: string;
  description?: string;
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
  owner?: DiscordResourceOwner;
};

export type CreateWebhookTokenInput = {
  uuid: string;
  description?: string;
  token: string;
  now?: Date;
  owner?: DiscordResourceOwner;
};

export type UpdateWebhookTokenInput = {
  description?: string;
  now?: Date;
  owner?: DiscordResourceOwner;
};

export interface WebhookTokenRepositoryInterface {
  createDynamicWebhookToken(
    input: CreateWebhookTokenInput,
  ): Promise<WebhookTokenRecord>;
  listDynamicWebhookTokens(): Promise<WebhookTokenRecord[]>;
  getDynamicWebhookToken(
    uuid: string,
  ): Promise<WebhookTokenRecord | null>;
  updateDynamicWebhookToken(
    uuid: string,
    input: UpdateWebhookTokenInput,
  ): Promise<WebhookTokenRecord | null>;
  deleteDynamicWebhookToken(uuid: string): Promise<void>;
}
