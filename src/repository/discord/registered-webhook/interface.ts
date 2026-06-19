export type RegisteredDiscordWebhookSummaryRecord = {
  uuid: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type RegisteredDiscordWebhookRecord =
  & RegisteredDiscordWebhookSummaryRecord
  & {
    discordWebhookUrl: string;
    discordWebhookUrlHash: string;
    pathToken: string;
  };

export type CreateRegisteredDiscordWebhookInput = {
  uuid: string;
  description?: string;
  discordWebhookUrl: string;
  pathToken: string;
  now?: Date;
};

export type UpdateRegisteredDiscordWebhookInput = {
  description?: string;
  now?: Date;
};

export interface DiscordRegisteredWebhookRepositoryInterface {
  createRegisteredDiscordWebhook(
    input: CreateRegisteredDiscordWebhookInput,
  ): Promise<RegisteredDiscordWebhookRecord>;
  listRegisteredDiscordWebhooks(): Promise<
    RegisteredDiscordWebhookSummaryRecord[]
  >;
  getRegisteredDiscordWebhook(
    uuid: string,
  ): Promise<RegisteredDiscordWebhookRecord | null>;
  updateRegisteredDiscordWebhook(
    uuid: string,
    input: UpdateRegisteredDiscordWebhookInput,
  ): Promise<RegisteredDiscordWebhookSummaryRecord | null>;
  deleteRegisteredDiscordWebhook(uuid: string): Promise<void>;
}
