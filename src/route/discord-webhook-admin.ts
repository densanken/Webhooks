import {
  createRoute as createOpenApiRoute,
  OpenAPIHono,
} from "@hono/zod-openapi";

import {
  createDiscordWebhookAdminController,
  type DiscordWebhookAdminControllerDependencies,
} from "../controller/discord-webhook-admin.ts";
import { createApiKeyMiddleware } from "../middleware/api.ts";
import { requireJsonContentType } from "../middleware/json-content-type.ts";
import {
  handleAdminError,
  jsonContent,
  noStoreHeader,
} from "./admin-helpers.ts";
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
} from "./discord-webhook-admin.schema.ts";

export type DiscordWebhookAdminRouteOptions =
  & DiscordWebhookAdminControllerDependencies
  & {
    apiKeys?: readonly string[];
  };

export const REGISTERED_DISCORD_WEBHOOK_TAG = "Registered Discord Webhooks";

export const createDiscordWebhookAdminRoute = (
  options: DiscordWebhookAdminRouteOptions,
) => {
  const controller = createDiscordWebhookAdminController(options);
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
        return c.json(
          await controller.createRegisteredDiscordWebhook(
            c.req.valid("json"),
          ),
          201,
        );
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
            content: jsonContent(RegisteredDiscordWebhookSummaryArraySchema),
          },
          401: {
            description: "API キーが無効です",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      }),
      async (c) =>
        c.json(await controller.listRegisteredDiscordWebhooks(), 200),
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
        return c.json(
          await controller.getRegisteredDiscordWebhook(
            c.req.valid("param").uuid,
          ),
          200,
        );
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
        const updated = await controller.updateRegisteredDiscordWebhook(
          c.req.valid("param").uuid,
          c.req.valid("json"),
        );

        return updated
          ? c.json(updated, 200)
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
        const revoked = await controller.revokeRegisteredDiscordWebhook(
          c.req.valid("param").uuid,
        );

        return revoked
          ? c.body(null, 204)
          : c.json({ error: "Not found" }, 404);
      },
    );

  return route;
};
