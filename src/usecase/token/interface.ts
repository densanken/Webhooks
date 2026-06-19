export type WebhookTokenSummary = {
  uuid: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatedWebhookToken = WebhookTokenSummary & {
  token: string;
};

export type CreateWebhookTokenInput = {
  description?: string;
  now?: Date;
};

export type UpdateWebhookTokenInput = {
  description: string;
  now?: Date;
};

export type WebhookTokenUseCaseOptions = {
  generateUuid?: () => string;
  generateToken?: () => string;
};

export interface WebhookTokenUseCaseInterface {
  createDynamicWebhookToken(
    input?: CreateWebhookTokenInput,
  ): Promise<CreatedWebhookToken>;
  listDynamicWebhookTokens(): Promise<WebhookTokenSummary[]>;
  updateDynamicWebhookToken(
    uuid: string,
    input: UpdateWebhookTokenInput,
  ): Promise<WebhookTokenSummary | null>;
  revokeDynamicWebhookToken(uuid: string): Promise<boolean>;
}
