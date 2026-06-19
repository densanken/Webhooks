export type DiscordRateLimitRecord = {
  discordWebhookUrlHash: string;
  blockedUntilEpochMs: number;
  retryAfterMs: number;
  reservationId?: string;
  scope?: string;
  bucket?: string;
  updatedAt: string;
};

export type SetDiscordRateLimitInput = {
  discordWebhookUrlHash: string;
  blockedUntilEpochMs: number;
  retryAfterMs: number;
  scope?: string;
  bucket?: string;
  now?: Date;
};

export type SetDiscordRateLimitForUrlInput =
  & Omit<
    SetDiscordRateLimitInput,
    "discordWebhookUrlHash"
  >
  & {
    discordWebhookUrl: string;
  };

export type ReserveDiscordRateLimitInput = {
  discordWebhookUrlHash: string;
  reservationId: string;
  reservationMs: number;
  now?: Date;
};

export type ReleaseDiscordRateLimitReservationInput = {
  discordWebhookUrlHash: string;
  reservationId: string;
};

export interface DiscordRateLimitRepositoryInterface {
  getDiscordUrlRateLimit(
    discordWebhookUrlHash: string,
  ): Promise<DiscordRateLimitRecord | null>;
  getDiscordUrlRateLimitForWebhookUrl(
    discordWebhookUrl: string,
  ): Promise<DiscordRateLimitRecord | null>;
  setDiscordUrlRateLimit(
    input: SetDiscordRateLimitInput,
  ): Promise<DiscordRateLimitRecord>;
  setDiscordUrlRateLimitForWebhookUrl(
    input: SetDiscordRateLimitForUrlInput,
  ): Promise<DiscordRateLimitRecord>;
  reserveDiscordUrlRateLimit(
    input: ReserveDiscordRateLimitInput,
  ): Promise<DiscordRateLimitRecord | null>;
  releaseDiscordUrlRateLimitReservation(
    input: ReleaseDiscordRateLimitReservationInput,
  ): Promise<boolean>;
  deleteDiscordUrlRateLimit(discordWebhookUrlHash: string): Promise<void>;
}
