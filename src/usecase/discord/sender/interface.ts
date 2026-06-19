export type DiscordSendFailureReason =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "network_error"
  | "server_error"
  | "unknown";

export type DiscordSendResult =
  | {
    ok: true;
    status?: number;
  }
  | {
    ok: false;
    reason: "rate_limited";
    upstreamStatus?: 429;
    retryAfterMs: number;
    blockedUntilEpochMs?: number;
    scope?: string;
    bucket?: string;
  }
  | {
    ok: false;
    reason: Exclude<DiscordSendFailureReason, "rate_limited">;
    upstreamStatus?: number;
  };

export type DiscordSendInput = {
  discordWebhookUrl: string;
  body: unknown;
};

export type DiscordSender = {
  sendDiscordWebhook(
    input: DiscordSendInput,
  ): Promise<DiscordSendResult>;
};
