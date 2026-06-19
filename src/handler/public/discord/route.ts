import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";

import {
  composeDiscordWebhookUseCase,
  type DiscordWebhookCompositionOptions,
} from "../../../composition/discord-webhook.ts";
import type { DiscordExecuteResult } from "../../../usecase/discord/execute/interface.ts";
import { UseCaseError } from "../../../usecase/error/impl.ts";
import { DiscordWebhookBodyValidationError } from "../../../util/discord/webhook-body.ts";

export type CreateDiscordWebhookRouteOptions = DiscordWebhookCompositionOptions;

type PublicDiscordWebhookResponse =
  | { statusCode: 204; body: null }
  | {
    statusCode: 202;
    body: { status: "queued"; reason: "blocked" | "rate_limited" };
  };

const toResponse = (
  result: DiscordExecuteResult,
): PublicDiscordWebhookResponse =>
  result.status === "sent" ? { statusCode: 204, body: null } : {
    statusCode: 202,
    body: { status: "queued", reason: result.reason },
  };

export const createDiscordWebhookRoute = async (
  options: CreateDiscordWebhookRouteOptions = {},
) => {
  const discordExecuteUseCase = await composeDiscordWebhookUseCase(options);
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
    const result = await discordExecuteUseCase.executeRegisteredDiscordWebhook({
      uuid,
      pathToken: token,
      request: c.req.raw,
    });
    const response = toResponse(result);

    return response.body === null
      ? c.body(null, response.statusCode)
      : c.json(response.body, response.statusCode);
  });

  route.post("/webhooks", async (c) => {
    const result = await discordExecuteUseCase.executeDynamicDiscordWebhook({
      request: c.req.raw,
    });
    const response = toResponse(result);

    return response.body === null
      ? c.body(null, response.statusCode)
      : c.json(response.body, response.statusCode);
  });

  return route;
};
