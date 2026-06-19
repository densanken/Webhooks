import {
  createRoute as createOpenApiRoute,
  OpenAPIHono,
} from "@hono/zod-openapi";

import {
  createTokenAdminController,
  type TokenAdminControllerDependencies,
} from "../controller/token-admin.ts";
import { createApiKeyMiddleware } from "../middleware/api.ts";
import { requireJsonContentType } from "../middleware/json-content-type.ts";
import {
  handleAdminError,
  jsonContent,
  noStoreHeader,
} from "./admin-helpers.ts";
import {
  CreatedWebhookTokenSchema,
  CreateWebhookTokenRequestSchema,
  ErrorResponseSchema,
  ResourceUuidParamsSchema,
  UpdatedWebhookTokenSchema,
  UpdateWebhookTokenRequestSchema,
  ValidationErrorResponseSchema,
  WebhookTokenSummaryArraySchema,
} from "./token-admin.schema.ts";

export type TokenAdminRouteOptions = TokenAdminControllerDependencies & {
  apiKeys?: readonly string[];
};

export const DYNAMIC_WEBHOOK_TOKEN_TAG = "Dynamic Webhook Tokens";

export const createTokenAdminRoute = (
  options: TokenAdminRouteOptions,
) => {
  const controller = createTokenAdminController(options);
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
  route.use("/tokens", (c, next) => {
    if (c.req.method !== "POST") return next();
    return requireJsonContentType(c, next);
  });
  route.use("/tokens/:uuid", (c, next) => {
    if (c.req.method !== "PATCH") return next();
    return requireJsonContentType(c, next);
  });

  route
    .openapi(
      createOpenApiRoute({
        method: "post",
        path: "/tokens",
        tags: [DYNAMIC_WEBHOOK_TOKEN_TAG],
        security: [{ "X-Api-Key": [] }],
        request: {
          body: {
            content: jsonContent(CreateWebhookTokenRequestSchema),
          },
        },
        responses: {
          201: {
            description: "動的 Webhook 用トークンを作成しました",
            headers: noStoreHeader,
            content: jsonContent(CreatedWebhookTokenSchema),
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
          await controller.createDynamicWebhookToken(c.req.valid("json")),
          201,
        );
      },
    )
    .openapi(
      createOpenApiRoute({
        method: "get",
        path: "/tokens",
        tags: [DYNAMIC_WEBHOOK_TOKEN_TAG],
        security: [{ "X-Api-Key": [] }],
        responses: {
          200: {
            description: "動的 Webhook 用トークンの一覧です",
            headers: noStoreHeader,
            content: jsonContent(WebhookTokenSummaryArraySchema),
          },
          401: {
            description: "API キーが無効です",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      }),
      async (c) => {
        c.header("Cache-Control", "no-store");
        return c.json(await controller.listDynamicWebhookTokens(), 200);
      },
    )
    .openapi(
      createOpenApiRoute({
        method: "patch",
        path: "/tokens/{uuid}",
        tags: [DYNAMIC_WEBHOOK_TOKEN_TAG],
        security: [{ "X-Api-Key": [] }],
        request: {
          params: ResourceUuidParamsSchema,
          body: {
            content: jsonContent(UpdateWebhookTokenRequestSchema),
          },
        },
        responses: {
          200: {
            description: "動的 Webhook 用トークンを更新しました",
            headers: noStoreHeader,
            content: jsonContent(UpdatedWebhookTokenSchema),
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
            description: "動的 Webhook 用トークンが見つかりませんでした",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      }),
      async (c) => {
        c.header("Cache-Control", "no-store");
        const updated = await controller.updateDynamicWebhookToken(
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
        path: "/tokens/{uuid}",
        tags: [DYNAMIC_WEBHOOK_TOKEN_TAG],
        security: [{ "X-Api-Key": [] }],
        request: {
          params: ResourceUuidParamsSchema,
        },
        responses: {
          204: {
            description: "動的 Webhook 用トークンを削除しました",
            headers: noStoreHeader,
          },
          401: {
            description: "API キーが無効です",
            content: jsonContent(ErrorResponseSchema),
          },
          404: {
            description: "動的 Webhook 用トークンが見つかりませんでした",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      }),
      async (c) => {
        const revoked = await controller.revokeDynamicWebhookToken(
          c.req.valid("param").uuid,
        );

        if (!revoked) return c.json({ error: "Not Found" }, 404);
        c.header("Cache-Control", "no-store");
        return c.body(null, 204);
      },
    );

  return route;
};
