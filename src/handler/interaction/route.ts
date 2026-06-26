import { Hono } from "hono";

import type { DiscordRegisteredWebhookUseCaseInterface } from "../../usecase/discord/registered-webhook/interface.ts";
import type { WebhookTokenUseCaseInterface } from "../../usecase/token/interface.ts";
import type { GuildWebhooksUseCaseInterface } from "../../usecase/discord/guild-webhook/interface.ts";
import type { DiscordSender } from "../../usecase/discord/sender/interface.ts";
import { verifyDiscordSignature } from "./verify.ts";
import { dispatchInteraction } from "./dispatcher.ts";
import { EmbedColor, ephemeralMessage } from "./response.ts";
export type { GuildContext } from "./dispatcher.ts";

export type InteractionsEnv = {
  discordApplicationId: string;
  discordPublicKey: string;
  discordBotToken: string;
  discordAllowedGuildIds: string[];
  publicBaseUrl: string;
};

export type InteractionsDependencies = {
  env: InteractionsEnv;
  registeredWebhookUseCase: DiscordRegisteredWebhookUseCaseInterface;
  tokenUseCase: WebhookTokenUseCaseInterface;
  guildWebhooksUseCase: GuildWebhooksUseCaseInterface;
  sender: DiscordSender;
};

export type CreateInteractionsRouteOptions = {
  kv: Deno.Kv;
};

export const createInteractionsRoute = async (
  options: CreateInteractionsRouteOptions,
): Promise<Hono | null> => {
  const { composeInteractionsDependencies } = await import(
    "../../composition/interactions.ts"
  );

  let deps: InteractionsDependencies;
  try {
    deps = composeInteractionsDependencies(options);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.endsWith(" must be set") ||
        error.message.startsWith("Requires env access to "))
    ) {
      return null;
    }
    throw error;
  }

  const app = new Hono();

  app.post("/", async (c) => {
    const signature = c.req.header("x-signature-ed25519");
    const timestamp = c.req.header("x-signature-timestamp");

    if (!signature || !timestamp) {
      return c.json({ error: "Missing signature headers" }, 401);
    }

    const body = await c.req.text();

    const isValid = await verifyDiscordSignature(
      deps.env.discordPublicKey,
      signature,
      timestamp,
      body,
    );

    if (!isValid) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    let interaction;
    try {
      interaction = JSON.parse(body);
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    let response;
    try {
      response = await dispatchInteraction(interaction, deps);
    } catch (error) {
      console.error("[interactions] Unhandled error:", error);
      return c.json(
        ephemeralMessage({
          title: "内部エラーが発生しました",
          description: "もう一度お試しください",
          color: EmbedColor.Error,
          footer: {
            text: "何度も起こる場合、Bot 管理者にお問い合わせください",
          },
        }),
      );
    }

    return c.json(response);
  });

  return app;
};
