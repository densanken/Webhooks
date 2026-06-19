import { DiscordWebhookSender } from "../infrastructure/discord-webhook-sender/impl.ts";
import { Kv } from "../infrastructure/kv/client.ts";
import { DiscordRateLimitRepository } from "../repository/discord/rate-limit/impl.ts";
import { DiscordQueueRepository } from "../repository/discord/queue/impl.ts";
import { DiscordDispatchUseCase } from "../usecase/discord/dispatch/impl.ts";

export const composeDispatcherDependencies = async () => {
  const kv = await Kv.getKv();
  const queueRepository = new DiscordQueueRepository(kv);
  const rateLimitRepository = new DiscordRateLimitRepository(kv);
  const sender = new DiscordWebhookSender();
  const dispatcher = new DiscordDispatchUseCase({
    queueRepository,
    rateLimitRepository,
    sender,
  });
  return { kv, queueRepository, rateLimitRepository, sender, dispatcher };
};
