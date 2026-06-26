import { DiscordRegisteredWebhookRepository } from "../repository/discord/registered-webhook/impl.ts";
import { WebhookTokenRepository } from "../repository/token/impl.ts";
import { GuildWebhooksRepository } from "../repository/discord/guild-webhooks/impl.ts";
import { DiscordRegisteredWebhookUseCase } from "../usecase/discord/registered-webhook/impl.ts";
import { WebhookTokenUseCase } from "../usecase/token/impl.ts";
import { GuildWebhooksUseCase } from "../usecase/discord/guild-webhook/impl.ts";
import { DiscordWebhookSender } from "../infrastructure/discord-webhook-sender/impl.ts";
import type { InteractionsDependencies } from "../handler/interaction/route.ts";

export type InteractionsCompositionOptions = {
  kv: Deno.Kv;
};

export const composeInteractionsDependencies = (
  options: InteractionsCompositionOptions,
): InteractionsDependencies => {
  const discordApplicationId = requireEnv("DISCORD_APPLICATION_ID");
  const discordPublicKey = requireEnv("DISCORD_PUBLIC_KEY");
  const discordBotToken = requireEnv("DISCORD_BOT_TOKEN");
  const discordAllowedGuildIds = requireEnv("DISCORD_ALLOWED_GUILD_IDS").split(
    ",",
  ).map((id) => id.trim())
    .filter((id) => id !== "");
  const publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") ?? "";

  const registeredWebhookUseCase = new DiscordRegisteredWebhookUseCase(
    new DiscordRegisteredWebhookRepository(options.kv),
    { publicBaseUrl },
  );
  const tokenUseCase = new WebhookTokenUseCase(
    new WebhookTokenRepository(options.kv),
  );
  const guildWebhooksUseCase = new GuildWebhooksUseCase(
    new GuildWebhooksRepository(options.kv),
    { botToken: discordBotToken },
  );
  const sender = new DiscordWebhookSender();

  return {
    env: {
      discordApplicationId,
      discordPublicKey,
      discordBotToken,
      discordAllowedGuildIds,
      publicBaseUrl,
    },
    registeredWebhookUseCase,
    tokenUseCase,
    guildWebhooksUseCase,
    sender,
  };
};

const requireEnv = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
};
