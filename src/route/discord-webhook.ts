import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";

import { createDiscordWebhookController } from "../controller/discord-webhook.ts";
import { DiscordWebhookSender } from "../infrastructure/discord-webhook-sender/impl.ts";
import { Kv } from "../infrastructure/kv/client.ts";
import { DiscordRateLimitRepository } from "../repository/discord/rate-limit/impl.ts";
import { DiscordQueueRepository } from "../repository/discord/queue/impl.ts";
import { WebhookTokenRepository } from "../repository/token/impl.ts";
import { DiscordRegisteredWebhookRepository } from "../repository/discord/registered-webhook/impl.ts";
import type { DiscordSender as DiscordSenderPort } from "../usecase/discord/sender/interface.ts";
import { UseCaseError } from "../usecase/error/impl.ts";
import { DiscordExecuteUseCase } from "../usecase/discord/execute/impl.ts";
import { DiscordWebhookBodyValidationError } from "../util/discord/webhook-body.ts";

export type CreateDiscordWebhookRouteOptions = {
  kv?: Deno.Kv;
  sender?: DiscordSenderPort;
  generateQueueMessageId?: () => string;
  getNow?: () => Date;
};

export const createDiscordWebhookRoute = async (
  options: CreateDiscordWebhookRouteOptions = {},
) => {
  const kv = options.kv ?? await Kv.getKv();
  const discordExecuteUseCase = new DiscordExecuteUseCase({
    registeredRepository: new DiscordRegisteredWebhookRepository(kv),
    tokenRepository: new WebhookTokenRepository(kv),
    queueRepository: new DiscordQueueRepository(kv),
    rateLimitRepository: new DiscordRateLimitRepository(kv),
    sender: options.sender ?? new DiscordWebhookSender(),
    generateQueueMessageId: options.generateQueueMessageId,
    getNow: options.getNow,
  });
  const controller = createDiscordWebhookController({
    discordExecuteUseCase,
  });
  const route = new Hono({ strict: false });

  route.use(bodyLimit({ maxSize: 1024 * 1024 })); // 1 MiB

  route.onError((error, c) => {
    if (
      error instanceof HTTPException && error.status === 413
    ) {
      return c.json({
        error: "Payload too large",
        code: "payload_too_large",
      }, 413);
    }

    if (error instanceof DiscordWebhookBodyValidationError) {
      return c.json({
        error: error.message,
        code: error.code,
        ...(error.issues.length > 0 ? { issues: error.issues } : {}),
      }, error.status);
    }

    if (error instanceof UseCaseError) {
      return c.json({
        error: error.message,
        code: error.code,
        ...(error.upstreamStatus === undefined
          ? {}
          : { upstreamStatus: error.upstreamStatus }),
      }, error.status);
    }

    throw error;
  });

  route.post("/webhooks/:uuid/:token", async (c) => {
    const { uuid, token } = c.req.param();
    const response = await controller.executeRegisteredDiscordWebhook({
      uuid,
      pathToken: token,
      request: c.req.raw,
    });

    return response.body === null
      ? c.body(null, response.statusCode)
      : c.json(response.body, response.statusCode);
  });

  route.post("/webhooks", async (c) => {
    const response = await controller.executeDynamicDiscordWebhook({
      request: c.req.raw,
    });

    return response.body === null
      ? c.body(null, response.statusCode)
      : c.json(response.body, response.statusCode);
  });

  return route;
};
