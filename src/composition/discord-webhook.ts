import { DiscordWebhookSender } from "../infrastructure/discord-webhook-sender/impl.ts";
import { Kv } from "../infrastructure/kv/client.ts";
import { DiscordRateLimitRepository } from "../repository/discord/rate-limit/impl.ts";
import { DiscordQueueRepository } from "../repository/discord/queue/impl.ts";
import { WebhookTokenRepository } from "../repository/token/impl.ts";
import { DiscordRegisteredWebhookRepository } from "../repository/discord/registered-webhook/impl.ts";
import type { DiscordSender as DiscordSenderPort } from "../usecase/discord/sender/interface.ts";
import { DiscordExecuteUseCase } from "../usecase/discord/execute/impl.ts";

export type DiscordWebhookCompositionOptions = {
  kv?: Deno.Kv;
  sender?: DiscordSenderPort;
  generateQueueMessageId?: () => string;
  getNow?: () => Date;
};

export const composeDiscordWebhookUseCase = async (
  options: DiscordWebhookCompositionOptions = {},
) => {
  const kv = options.kv ?? await Kv.getKv();
  return new DiscordExecuteUseCase({
    registeredRepository: new DiscordRegisteredWebhookRepository(kv),
    tokenRepository: new WebhookTokenRepository(kv),
    queueRepository: new DiscordQueueRepository(kv),
    rateLimitRepository: new DiscordRateLimitRepository(kv),
    sender: options.sender ?? new DiscordWebhookSender(),
    generateQueueMessageId: options.generateQueueMessageId,
    getNow: options.getNow,
  });
};
