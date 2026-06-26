import type { DiscordResourceOwner } from "../../../repository/discord/owner.ts";

export type RegisteredDiscordWebhookSummary = {
  uuid: string;
  description: string;
  owner?: DiscordResourceOwner;
  createdAt: string;
  updatedAt: string;
};

export type RegisteredDiscordWebhookDetail =
  & RegisteredDiscordWebhookSummary
  & {
    webhookUrl: string;
    discordWebhookUrl: string;
  };

export type CreateRegisteredDiscordWebhookInput = {
  discordWebhookUrl: string;
  description: string;
  owner?: DiscordResourceOwner;
  now?: Date;
};

export type UpdateRegisteredDiscordWebhookInput = {
  description?: string;
  owner?: DiscordResourceOwner;
  now?: Date;
};

export type RegisteredDiscordWebhookUseCaseOptions = {
  publicBaseUrl?: string;
  generateUuid?: () => string;
  generateToken?: () => string;
};

export interface DiscordRegisteredWebhookUseCaseInterface {
  createRegisteredDiscordWebhook(
    input: CreateRegisteredDiscordWebhookInput,
  ): Promise<RegisteredDiscordWebhookDetail>;
  listRegisteredDiscordWebhooks(): Promise<
    RegisteredDiscordWebhookSummary[]
  >;
  getRegisteredDiscordWebhook(
    uuid: string,
  ): Promise<RegisteredDiscordWebhookDetail | null>;
  requireRegisteredDiscordWebhook(
    uuid: string,
  ): Promise<RegisteredDiscordWebhookDetail>;
  updateRegisteredDiscordWebhook(
    uuid: string,
    input: UpdateRegisteredDiscordWebhookInput,
  ): Promise<RegisteredDiscordWebhookSummary | null>;
  revokeRegisteredDiscordWebhook(uuid: string): Promise<boolean>;
  listRegisteredDiscordWebhooksByGuild(
    guildId: string,
  ): Promise<RegisteredDiscordWebhookSummary[]>;
}
