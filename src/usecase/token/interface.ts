import type { DiscordResourceOwner } from "../../repository/discord/owner.ts";

export type WebhookTokenSummary = {
  uuid: string;
  description: string;
  owner?: DiscordResourceOwner;
  createdAt: string;
  updatedAt: string;
};

export type CreatedWebhookToken = WebhookTokenSummary & {
  token: string;
};

export type CreateWebhookTokenInput = {
  description: string;
  owner?: DiscordResourceOwner;
  now?: Date;
};

export type UpdateWebhookTokenInput = {
  description?: string;
  owner?: DiscordResourceOwner;
  now?: Date;
};

export type WebhookTokenUseCaseOptions = {
  generateUuid?: () => string;
  generateToken?: () => string;
};

export interface WebhookTokenUseCaseInterface {
  createDynamicWebhookToken(
    input: CreateWebhookTokenInput,
  ): Promise<CreatedWebhookToken>;
  listDynamicWebhookTokens(): Promise<WebhookTokenSummary[]>;
  getDynamicWebhookToken(uuid: string): Promise<WebhookTokenSummary | null>;
  updateDynamicWebhookToken(
    uuid: string,
    input: UpdateWebhookTokenInput,
  ): Promise<WebhookTokenSummary | null>;
  revokeDynamicWebhookToken(uuid: string): Promise<boolean>;
  listDynamicWebhookTokensByGuild(
    guildId: string,
  ): Promise<WebhookTokenSummary[]>;
}
