import type { DiscordQueueRepositoryInterface } from "../../../repository/discord/queue/interface.ts";
import type { DiscordRateLimitRepositoryInterface } from "../../../repository/discord/rate-limit/interface.ts";
import type { WebhookTokenRepositoryInterface } from "../../../repository/token/interface.ts";
import type { DiscordRegisteredWebhookRepositoryInterface } from "../../../repository/discord/registered-webhook/interface.ts";
import type { DiscordSender } from "../sender/interface.ts";

export type DiscordExecuteUseCaseOptions = {
  registeredRepository: DiscordRegisteredWebhookRepositoryInterface;
  tokenRepository: WebhookTokenRepositoryInterface;
  queueRepository: DiscordQueueRepositoryInterface;
  rateLimitRepository: DiscordRateLimitRepositoryInterface;
  sender: DiscordSender;
  generateQueueMessageId?: () => string;
  getNow?: () => Date;
};
