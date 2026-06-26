export type GuildWebhookSyncResult = {
  guildId: string;
  fetched: number;
  added: number;
  updated: number;
  removed: number;
};

export type GuildWebhooksUseCaseOptions = {
  botToken: string;
  fetcher?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
};

export interface GuildWebhooksUseCaseInterface {
  syncGuildWebhooks(guildId: string): Promise<GuildWebhookSyncResult>;
  isGuildWebhook(
    guildId: string,
    webhookId: string,
  ): Promise<boolean>;
  isGuildWebhookWithRefresh(
    guildId: string,
    webhookId: string,
  ): Promise<boolean>;
}
