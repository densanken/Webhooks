import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";

import { Kv } from "../../infrastructure/kv/client.ts";
import { createDocAuthMiddleware } from "../../middleware/doc.ts";
import { composeDiscordAdminUseCase } from "../../composition/discord-admin.ts";
import { composeTokenAdminUseCase } from "../../composition/token-admin.ts";
import {
  createDiscordWebhookAdminRoute,
  REGISTERED_DISCORD_WEBHOOK_TAG,
} from "./discord/route.ts";
import {
  createDocOAuthRoute,
  type DocOAuthConfig,
  getDocOAuthConfig,
} from "./doc-oauth.ts";
import {
  createTokenAdminRoute,
  DYNAMIC_WEBHOOK_TOKEN_TAG,
} from "./token/route.ts";
import {
  PUBLIC_DISCORD_WEBHOOK_TAG,
  publicWebhookOpenApiPaths,
} from "../public/discord/openapi.ts";

const OPENAPI_DOCUMENT_PATH = "/doc";
const OPENAPI_UI_PATH = "/doc/ui";

export type CreateApiRouteOptions = {
  kv?: Deno.Kv;
  apiKeys?: readonly string[];
  docAuth?: DocOAuthConfig | null;
  publicBaseUrl?: string;
};

export const createApiRoute = async (
  options: CreateApiRouteOptions = {},
) => {
  const kv = options.kv ?? await Kv.getKv();
  const discordWebhookAdminRoute = createDiscordWebhookAdminRoute({
    apiKeys: options.apiKeys,
    registeredDiscordWebhookUseCase: composeDiscordAdminUseCase({
      kv,
      publicBaseUrl: options.publicBaseUrl,
    }),
  });
  const tokenAdminRoute = createTokenAdminRoute({
    apiKeys: options.apiKeys,
    webhookTokenUseCase: composeTokenAdminUseCase({ kv }),
  });

  // 2 つの管理ルートの OpenAPI ドキュメントを統合する
  const discordAdminDocument = discordWebhookAdminRoute.getOpenAPI31Document({
    openapi: "3.1.0",
    info: {
      version: "latest",
      title: "Personal Webhook Admin API",
    },
    servers: [{ url: "/" }],
    tags: [
      {
        name: REGISTERED_DISCORD_WEBHOOK_TAG,
        description:
          "Discord Webhook の送信先を登録し、専用の公開 Webhook URL を管理します。作成レスポンスでは Discord Webhook トークンを秘匿化し、詳細レスポンスのみ復号済みの送信先 URL を返します。",
      },
      {
        name: DYNAMIC_WEBHOOK_TOKEN_TAG,
        description:
          "Webhook の送信先を動的に指定するリクエスト用の Bearer トークンを作成・一覧取得・削除します。平文のトークンは作成時に一度だけ返します。",
      },
      {
        name: PUBLIC_DISCORD_WEBHOOK_TAG,
        description:
          "Discord Webhook ペイロードを受け付ける公開エンドポイントです。API キーは不要で、通常は即時 Discord に転送します。送信先がレート制限中の場合はメッセージをキューに入れます。",
      },
    ],
  });
  const tokenAdminDocument = tokenAdminRoute.getOpenAPI31Document({
    openapi: "3.1.0",
    info: {
      version: "latest",
      title: "Personal Webhook Admin API",
    },
    servers: [{ url: "/" }],
  });

  const openApiDocument = {
    ...discordAdminDocument,
    components: {
      ...discordAdminDocument.components,
      schemas: {
        ...discordAdminDocument.components?.schemas,
        ...tokenAdminDocument.components?.schemas,
      },
      securitySchemes: {
        ...discordAdminDocument.components?.securitySchemes,
        ...tokenAdminDocument.components?.securitySchemes,
      },
    },
    paths: {
      ...Object.fromEntries(
        Object.entries(discordAdminDocument.paths ?? {}).map(
          ([path, operation]) => [`/api${path}`, operation],
        ),
      ),
      ...Object.fromEntries(
        Object.entries(tokenAdminDocument.paths ?? {}).map(
          ([path, operation]) => [`/api${path}`, operation],
        ),
      ),
      ...publicWebhookOpenApiPaths,
    },
  };

  const route = new Hono({ strict: false });
  const docAuth = options.docAuth === undefined
    ? getDocOAuthConfig()
    : options.docAuth;

  if (!docAuth) {
    route.get(
      OPENAPI_DOCUMENT_PATH,
      (c) => c.json({ error: "Service Unavailable" }, 503),
    );
    route.get(
      OPENAPI_UI_PATH,
      (c) => c.json({ error: "Service Unavailable" }, 503),
    );
  } else {
    const docAuthMiddleware = createDocAuthMiddleware(docAuth.sessionSecret);
    route.get(
      OPENAPI_DOCUMENT_PATH,
      docAuthMiddleware,
      (c) => c.json(openApiDocument),
    );
    route.get(
      OPENAPI_UI_PATH,
      docAuthMiddleware,
      Scalar({
        url: `/api${OPENAPI_DOCUMENT_PATH}`,
        pageTitle: "Personal Webhook Admin API Reference",
      }),
    );
    route.route("/doc", createDocOAuthRoute(docAuth));
  }

  route.route("/", discordWebhookAdminRoute);
  route.route("/", tokenAdminRoute);

  return route;
};
