import { DiscordWebhookSender } from "../infrastructure/discord-webhook-sender/impl.ts";
import { Kv } from "../infrastructure/kv/client.ts";
import { DiscordRateLimitRepository } from "../repository/discord/rate-limit/impl.ts";
import { DiscordQueueRepository } from "../repository/discord/queue/impl.ts";
import { WebhookTokenRepository } from "../repository/token/impl.ts";
import { DiscordRegisteredWebhookRepository } from "../repository/discord/registered-webhook/impl.ts";
import { GuildWebhooksRepository } from "../repository/discord/guild-webhooks/impl.ts";
import type { DiscordSender as DiscordSenderPort } from "../usecase/discord/sender/interface.ts";
import { DiscordExecuteUseCase } from "../usecase/discord/execute/impl.ts";
import { GuildWebhooksUseCase } from "../usecase/discord/guild-webhook/impl.ts";
import type { GuildWebhooksUseCaseInterface } from "../usecase/discord/guild-webhook/interface.ts";

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

  let guildWebhooksUseCase: GuildWebhooksUseCaseInterface | undefined;
  try {
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN")?.trim();
    if (botToken) {
      guildWebhooksUseCase = new GuildWebhooksUseCase(
        new GuildWebhooksRepository(kv),
        { botToken },
      );
    }
  } catch {
    // env access not permitted (e.g. in tests)
  }

  return new DiscordExecuteUseCase({
    registeredRepository: new DiscordRegisteredWebhookRepository(kv),
    tokenRepository: new WebhookTokenRepository(kv),
    queueRepository: new DiscordQueueRepository(kv),
    rateLimitRepository: new DiscordRateLimitRepository(kv),
    sender: options.sender ?? new DiscordWebhookSender(),
    guildWebhooksUseCase,
    generateQueueMessageId: options.generateQueueMessageId,
    getNow: options.getNow,
  });
};
