export type WebhookTokenRecord = {
  uuid: string;
  description?: string;
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateWebhookTokenInput = {
  uuid: string;
  description?: string;
  token: string;
  now?: Date;
};

export type UpdateWebhookTokenInput = {
  description?: string;
  now?: Date;
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
