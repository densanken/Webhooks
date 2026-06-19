export type DiscordExecuteResult =
  | {
    status: "sent";
    statusCode: 204;
  }
  | {
    status: "queued";
    statusCode: 202;
    reason: "blocked" | "rate_limited";
    queuedMessageId: string;
    blockedUntilEpochMs?: number;
  };

export type ExecuteRegisteredDiscordWebhookInput = {
  uuid: string;
  pathToken: string;
  request: Request;
  now?: Date;
};

export type ExecuteDynamicDiscordWebhookInput = {
  request: Request;
  now?: Date;
};

export interface DiscordExecuteUseCaseInterface {
  executeRegisteredDiscordWebhook(
    input: ExecuteRegisteredDiscordWebhookInput,
  ): Promise<DiscordExecuteResult>;
  executeDynamicDiscordWebhook(
    input: ExecuteDynamicDiscordWebhookInput,
  ): Promise<DiscordExecuteResult>;
}
