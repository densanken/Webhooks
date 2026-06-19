import {
  createRoute as createOpenApiRoute,
  OpenAPIHono,
} from "@hono/zod-openapi";

import { createApiKeyMiddleware } from "../../../middleware/api.ts";
import { requireJsonContentType } from "../../../middleware/json-content-type.ts";
import { handleAdminError, jsonContent, noStoreHeader } from "../helpers.ts";
import type { DiscordRegisteredWebhookUseCaseInterface } from "../../../usecase/discord/registered-webhook/interface.ts";
import {
  CreatedRegisteredDiscordWebhookSchema,
  CreateRegisteredDiscordWebhookRequestSchema,
  ErrorResponseSchema,
  RegisteredDiscordWebhookDetailSchema,
  RegisteredDiscordWebhookSummaryArraySchema,
  ResourceUuidParamsSchema,
  UpdatedRegisteredDiscordWebhookSchema,
  UpdateRegisteredDiscordWebhookRequestSchema,
  ValidationErrorResponseSchema,
} from "./schema.ts";

export type DiscordWebhookAdminRouteOptions = {
  registeredDiscordWebhookUseCase: DiscordRegisteredWebhookUseCaseInterface;
  apiKeys?: readonly string[];
};

export const REGISTERED_DISCORD_WEBHOOK_TAG = "Registered Discord Webhooks";

const requiredDescription = (description: string | undefined): string =>
  description ?? "";

export const createDiscordWebhookAdminRoute = (
  options: DiscordWebhookAdminRouteOptions,
) => {
  const route = new OpenAPIHono({
    strict: false,
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({
          error: "Validation failed",
          details: result.error.issues,
        }, 400);
      }
    },
  });

  route.openAPIRegistry.registerComponent(
    "securitySchemes",
    "X-Api-Key",
    {
      type: "apiKey",
      in: "header",
      name: "X-Api-Key",
    },
  );

  route.onError(handleAdminError);

  route.use("*", createApiKeyMiddleware(options.apiKeys));
  route.use("/discord/webhooks", (c, next) => {
    if (c.req.method !== "POST") return next();
    return requireJsonContentType(c, next);
  });
  route.use("/discord/webhooks/:uuid", (c, next) => {
    if (c.req.method !== "PATCH") return next();
    return requireJsonContentType(c, next);
  });

  route
    .openapi(
      createOpenApiRoute({
        method: "post",
        path: "/discord/webhooks",
        tags: [REGISTERED_DISCORD_WEBHOOK_TAG],
        security: [{ "X-Api-Key": [] }],
        request: {
          body: {
            content: jsonContent(
              CreateRegisteredDiscordWebhookRequestSchema,
            ),
          },
        },
        responses: {
          201: {
            description: "Discord Webhook を登録しました",
            headers: noStoreHeader,
            content: jsonContent(CreatedRegisteredDiscordWebhookSchema),
          },
          400: {
            description: "リクエストボディが不正です",
            content: jsonContent(ValidationErrorResponseSchema),
          },
          401: {
            description: "API キーが無効です",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      }),
      async (c) => {
        c.header("Cache-Control", "no-store");
        const created = await options.registeredDiscordWebhookUseCase
          .createRegisteredDiscordWebhook(c.req.valid("json"));
        return c.json({
          uuid: created.uuid,
          description: requiredDescription(created.description),
          webhookUrl: created.webhookUrl,
          discordWebhookUrl: created.discordWebhookUrl,
          createdAt: created.createdAt,
        }, 201);
      },
    )
    .openapi(
      createOpenApiRoute({
        method: "get",
        path: "/discord/webhooks",
        tags: [REGISTERED_DISCORD_WEBHOOK_TAG],
        security: [{ "X-Api-Key": [] }],
        responses: {
          200: {
            description: "登録済み Discord Webhook の一覧です",
            headers: noStoreHeader,
            content: jsonContent(RegisteredDiscordWebhookSummaryArraySchema),
          },
          401: {
            description: "API キーが無効です",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      }),
      async (c) => {
        c.header("Cache-Control", "no-store");
        const webhooks = await options.registeredDiscordWebhookUseCase
          .listRegisteredDiscordWebhooks();
        return c.json(
          webhooks.map((webhook) => ({
            ...webhook,
            description: requiredDescription(webhook.description),
          })),
          200,
        );
      },
    )
    .openapi(
      createOpenApiRoute({
        method: "get",
        path: "/discord/webhooks/{uuid}",
        tags: [REGISTERED_DISCORD_WEBHOOK_TAG],
        security: [{ "X-Api-Key": [] }],
        request: {
          params: ResourceUuidParamsSchema,
        },
        responses: {
          200: {
            description: "登録済み Discord Webhook の詳細です",
            headers: noStoreHeader,
            content: jsonContent(RegisteredDiscordWebhookDetailSchema),
          },
          401: {
            description: "API キーが無効です",
            content: jsonContent(ErrorResponseSchema),
          },
          404: {
            description: "登録済み Discord Webhook が見つかりませんでした",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      }),
      async (c) => {
        c.header("Cache-Control", "no-store");
        const webhook = await options.registeredDiscordWebhookUseCase
          .requireRegisteredDiscordWebhook(c.req.valid("param").uuid);
        return c.json({
          uuid: webhook.uuid,
          description: requiredDescription(webhook.description),
          discordWebhookUrl: webhook.discordWebhookUrl,
          webhookUrl: webhook.webhookUrl,
          createdAt: webhook.createdAt,
          updatedAt: webhook.updatedAt,
        }, 200);
      },
    )
    .openapi(
      createOpenApiRoute({
        method: "patch",
        path: "/discord/webhooks/{uuid}",
        tags: [REGISTERED_DISCORD_WEBHOOK_TAG],
        security: [{ "X-Api-Key": [] }],
        request: {
          params: ResourceUuidParamsSchema,
          body: {
            content: jsonContent(UpdateRegisteredDiscordWebhookRequestSchema),
          },
        },
        responses: {
          200: {
            description: "設定を更新しました",
            headers: noStoreHeader,
            content: jsonContent(UpdatedRegisteredDiscordWebhookSchema),
          },
          400: {
            description: "リクエストボディが不正です",
            content: jsonContent(ValidationErrorResponseSchema),
          },
          401: {
            description: "API キーが無効です",
            content: jsonContent(ErrorResponseSchema),
          },
          404: {
            description: "登録済み Discord Webhook が見つかりませんでした",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      }),
      async (c) => {
        c.header("Cache-Control", "no-store");
        const { description } = c.req.valid("json");
        const updated = await options.registeredDiscordWebhookUseCase
          .updateRegisteredDiscordWebhook(c.req.valid("param").uuid, {
            description,
          });

        return updated
          ? c.json({
            ...updated,
            description: requiredDescription(updated.description),
          }, 200)
          : c.json({ error: "Not found" }, 404);
      },
    )
    .openapi(
      createOpenApiRoute({
        method: "delete",
        path: "/discord/webhooks/{uuid}",
        tags: [REGISTERED_DISCORD_WEBHOOK_TAG],
        security: [{ "X-Api-Key": [] }],
        request: {
          params: ResourceUuidParamsSchema,
        },
        responses: {
          204: {
            description: "登録済み Discord Webhook を削除しました",
            headers: noStoreHeader,
          },
          401: {
            description: "API キーが無効です",
            content: jsonContent(ErrorResponseSchema),
          },
          404: {
            description: "登録済み Discord Webhook が見つかりませんでした",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      }),
      async (c) => {
        const revoked = await options.registeredDiscordWebhookUseCase
          .revokeRegisteredDiscordWebhook(c.req.valid("param").uuid);

        if (!revoked) return c.json({ error: "Not Found" }, 404);
        c.header("Cache-Control", "no-store");
        return c.body(null, 204);
      },
    );

  return route;
};
