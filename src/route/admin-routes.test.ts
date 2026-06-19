import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { MockDiscordRegisteredWebhookRepository } from "../repository/discord/registered-webhook/impl.mock.ts";
import { MockWebhookTokenRepository } from "../repository/token/impl.mock.ts";
import { discordWebhookUrl } from "../test-helper/webhook.ts";
import { DiscordRegisteredWebhookUseCase } from "../usecase/discord/registered-webhook/impl.ts";
import { WebhookTokenUseCase } from "../usecase/token/impl.ts";
import { createDiscordWebhookAdminRoute } from "./discord-webhook-admin.ts";
import { createTokenAdminRoute } from "./token-admin.ts";

const API_KEY = "test-api-key";
const REGISTERED_UUID = "registered-1";
const PATH_TOKEN = "path-token";
const DYNAMIC_TOKEN_UUID = "token-1";
const DYNAMIC_TOKEN = "a".repeat(43);

const createTestRoutes = () => {
  const discordWebhookAdminRoute = createDiscordWebhookAdminRoute({
    apiKeys: [API_KEY],
    registeredDiscordWebhookUseCase: new DiscordRegisteredWebhookUseCase(
      new MockDiscordRegisteredWebhookRepository(),
      {
        publicBaseUrl: "https://example.com/",
        generateUuid: () => REGISTERED_UUID,
        generateToken: () => PATH_TOKEN,
      },
    ),
  });
  const tokenAdminRoute = createTokenAdminRoute({
    apiKeys: [API_KEY],
    webhookTokenUseCase: new WebhookTokenUseCase(
      new MockWebhookTokenRepository(),
      {
        generateUuid: () => DYNAMIC_TOKEN_UUID,
        generateToken: () => DYNAMIC_TOKEN,
      },
    ),
  });
  return { discordWebhookAdminRoute, tokenAdminRoute };
};

const createTestApp = () => {
  const { discordWebhookAdminRoute, tokenAdminRoute } = createTestRoutes();
  return new Hono()
    .route("/api", discordWebhookAdminRoute)
    .route("/api", tokenAdminRoute);
};

const authorizedHeaders = (headers: HeadersInit = {}): Headers => {
  const result = new Headers(headers);
  result.set("X-Api-Key", API_KEY);
  return result;
};

Deno.test("Webhook 管理ルートは有効な API キーを要求する", async () => {
  const app = createTestApp();

  const missingApiKey = await app.request("/api/discord/webhooks");
  assertEquals(missingApiKey.status, 401);
  assertEquals(await missingApiKey.json(), { error: "Unauthorized" });

  const invalidApiKey = await app.request("/api/tokens", {
    headers: { "X-Api-Key": "invalid" },
  });
  assertEquals(invalidApiKey.status, 401);
});

Deno.test("Webhook 管理ルートは不正なリクエストボディを拒否する", async () => {
  const app = createTestApp();

  const invalidDiscordUrl = await app.request("/api/discord/webhooks", {
    method: "POST",
    headers: authorizedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      discordWebhookUrl: "https://example.com/not-discord",
      description: "invalid URL",
    }),
  });
  assertEquals(invalidDiscordUrl.status, 400);

  const missingRegisteredDescription = await app.request(
    "/api/discord/webhooks",
    {
      method: "POST",
      headers: authorizedHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        discordWebhookUrl: discordWebhookUrl(),
      }),
    },
  );
  assertEquals(missingRegisteredDescription.status, 400);

  const missingTokenDescription = await app.request("/api/tokens", {
    method: "POST",
    headers: authorizedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({}),
  });
  assertEquals(missingTokenDescription.status, 400);

  const longDescription = await app.request("/api/tokens", {
    method: "POST",
    headers: authorizedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ description: "a".repeat(201) }),
  });
  assertEquals(longDescription.status, 400);

  for (
    const { path, method } of [
      { path: "/api/discord/webhooks", method: "POST" },
      { path: "/api/tokens", method: "POST" },
      { path: `/api/discord/webhooks/${REGISTERED_UUID}`, method: "PATCH" },
      { path: `/api/tokens/${DYNAMIC_TOKEN_UUID}`, method: "PATCH" },
    ]
  ) {
    for (
      const invalidContentType of [
        { name: "text/plain", contentType: "text/plain" },
        { name: "missing Content-Type", contentType: undefined },
      ]
    ) {
      const headers = authorizedHeaders();
      if (invalidContentType.contentType !== undefined) {
        headers.set("Content-Type", invalidContentType.contentType);
      }

      const response = await app.request(path, {
        method,
        headers,
        body: "not-json",
      });

      assertEquals(
        response.status,
        400,
        `${method} ${path}: ${invalidContentType.name}`,
      );
      assertEquals(response.headers.get("content-type"), "application/json");
      assertEquals(await response.json(), {
        error: "Validation failed",
        details: [{
          code: "custom",
          path: [],
          message: "Content-Type must be application/json",
        }],
      });
    }

    const malformedJson = await app.request(path, {
      method,
      headers: authorizedHeaders({ "Content-Type": "application/json" }),
      body: "{bad",
    });
    assertEquals(malformedJson.status, 400, `${method} ${path}`);
    assertEquals(
      malformedJson.headers.get("content-type"),
      "application/json",
    );
    assertEquals(await malformedJson.json(), {
      error: "Validation failed",
      details: [{
        code: "custom",
        path: [],
        message: "Malformed JSON in request body",
      }],
    });
  }
});

Deno.test("登録済み Discord Webhook 管理ルートは Webhook を管理できる", async () => {
  const app = createTestApp();

  const createdResponse = await app.request("/api/discord/webhooks", {
    method: "POST",
    headers: authorizedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      discordWebhookUrl: discordWebhookUrl(),
      description: "production alerts",
    }),
  });
  assertEquals(createdResponse.status, 201);
  assertEquals(createdResponse.headers.get("cache-control"), "no-store");
  const created = await createdResponse.json();
  assertEquals(created, {
    uuid: REGISTERED_UUID,
    description: "production alerts",
    webhookUrl:
      `https://example.com/discord/webhooks/${REGISTERED_UUID}/${PATH_TOKEN}`,
    discordWebhookUrl: discordWebhookUrl(),
    createdAt: created.createdAt,
  });

  const listResponse = await app.request("/api/discord/webhooks", {
    headers: authorizedHeaders(),
  });
  assertEquals(listResponse.status, 200);
  assertEquals(await listResponse.json(), [{
    uuid: REGISTERED_UUID,
    description: "production alerts",
    createdAt: created.createdAt,
    updatedAt: created.createdAt,
  }]);

  const detailResponse = await app.request(
    `/api/discord/webhooks/${REGISTERED_UUID}`,
    { headers: authorizedHeaders() },
  );
  assertEquals(detailResponse.status, 200);
  assertEquals(detailResponse.headers.get("cache-control"), "no-store");
  assertEquals(await detailResponse.json(), {
    uuid: REGISTERED_UUID,
    description: "production alerts",
    discordWebhookUrl: discordWebhookUrl(),
    webhookUrl:
      `https://example.com/discord/webhooks/${REGISTERED_UUID}/${PATH_TOKEN}`,
    createdAt: created.createdAt,
    updatedAt: created.createdAt,
  });

  const updateResponse = await app.request(
    `/api/discord/webhooks/${REGISTERED_UUID}`,
    {
      method: "PATCH",
      headers: authorizedHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ description: "updated alerts" }),
    },
  );
  assertEquals(updateResponse.status, 200);
  assertEquals(updateResponse.headers.get("cache-control"), "no-store");
  const updated = await updateResponse.json();
  assertEquals(updated, {
    uuid: REGISTERED_UUID,
    description: "updated alerts",
    createdAt: created.createdAt,
    updatedAt: updated.updatedAt,
  });

  const missingUpdateResponse = await app.request(
    `/api/discord/webhooks/non-existent-uuid`,
    {
      method: "PATCH",
      headers: authorizedHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ description: "nope" }),
    },
  );
  assertEquals(missingUpdateResponse.status, 404);

  const deleteResponse = await app.request(
    `/api/discord/webhooks/${REGISTERED_UUID}`,
    { method: "DELETE", headers: authorizedHeaders() },
  );
  assertEquals(deleteResponse.status, 204);
  assertEquals(await deleteResponse.text(), "");

  const missingResponse = await app.request(
    `/api/discord/webhooks/${REGISTERED_UUID}`,
    { headers: authorizedHeaders() },
  );
  assertEquals(missingResponse.status, 404);
});

Deno.test("動的 Webhook 用トークン管理ルートはトークンを管理できる", async () => {
  const app = createTestApp();

  const createdResponse = await app.request("/api/tokens", {
    method: "POST",
    headers: authorizedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      description: "deploy hook",
    }),
  });
  assertEquals(createdResponse.status, 201);
  assertEquals(createdResponse.headers.get("cache-control"), "no-store");
  const created = await createdResponse.json();
  assertEquals(created, {
    uuid: DYNAMIC_TOKEN_UUID,
    description: "deploy hook",
    token: DYNAMIC_TOKEN,
    createdAt: created.createdAt,
  });

  const listResponse = await app.request("/api/tokens", {
    headers: authorizedHeaders(),
  });
  assertEquals(listResponse.status, 200);
  assertEquals(await listResponse.json(), [{
    uuid: DYNAMIC_TOKEN_UUID,
    description: "deploy hook",
    createdAt: created.createdAt,
    updatedAt: created.createdAt,
  }]);

  const updateResponse = await app.request(
    `/api/tokens/${DYNAMIC_TOKEN_UUID}`,
    {
      method: "PATCH",
      headers: authorizedHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ description: "updated hook" }),
    },
  );
  assertEquals(updateResponse.status, 200);
  assertEquals(updateResponse.headers.get("cache-control"), "no-store");
  const updated = await updateResponse.json();
  assertEquals(updated, {
    uuid: DYNAMIC_TOKEN_UUID,
    description: "updated hook",
    createdAt: created.createdAt,
    updatedAt: updated.updatedAt,
  });

  const missingUpdateResponse = await app.request(
    `/api/tokens/non-existent-uuid`,
    {
      method: "PATCH",
      headers: authorizedHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ description: "nope" }),
    },
  );
  assertEquals(missingUpdateResponse.status, 404);

  const deleteResponse = await app.request(
    `/api/tokens/${DYNAMIC_TOKEN_UUID}`,
    {
      method: "DELETE",
      headers: authorizedHeaders(),
    },
  );
  assertEquals(deleteResponse.status, 204);

  const missingResponse = await app.request(
    `/api/tokens/${DYNAMIC_TOKEN_UUID}`,
    { method: "DELETE", headers: authorizedHeaders() },
  );
  assertEquals(missingResponse.status, 404);
});

Deno.test("Webhook 管理ルートは欠落した説明フィールドを正規化する", async () => {
  const registeredRepository = new MockDiscordRegisteredWebhookRepository();
  const registered = await registeredRepository.createRegisteredDiscordWebhook(
    {
      uuid: REGISTERED_UUID,
      discordWebhookUrl: discordWebhookUrl(),
      pathToken: PATH_TOKEN,
    },
  );
  const tokenRepository = new MockWebhookTokenRepository();
  const token = await tokenRepository.createDynamicWebhookToken({
    uuid: DYNAMIC_TOKEN_UUID,
    token: DYNAMIC_TOKEN,
  });
  const app = new Hono()
    .route(
      "/api",
      createDiscordWebhookAdminRoute({
        apiKeys: [API_KEY],
        registeredDiscordWebhookUseCase: new DiscordRegisteredWebhookUseCase(
          registeredRepository,
          { publicBaseUrl: "https://example.com/" },
        ),
      }),
    )
    .route(
      "/api",
      createTokenAdminRoute({
        apiKeys: [API_KEY],
        webhookTokenUseCase: new WebhookTokenUseCase(
          tokenRepository,
        ),
      }),
    );

  const registeredList = await app.request("/api/discord/webhooks", {
    headers: authorizedHeaders(),
  });
  assertEquals(await registeredList.json(), [{
    uuid: REGISTERED_UUID,
    description: "",
    createdAt: registered.createdAt,
    updatedAt: registered.updatedAt,
  }]);

  const registeredDetail = await app.request(
    `/api/discord/webhooks/${REGISTERED_UUID}`,
    { headers: authorizedHeaders() },
  );
  assertEquals(await registeredDetail.json(), {
    uuid: REGISTERED_UUID,
    description: "",
    discordWebhookUrl: discordWebhookUrl(),
    webhookUrl:
      `https://example.com/discord/webhooks/${REGISTERED_UUID}/${PATH_TOKEN}`,
    createdAt: registered.createdAt,
    updatedAt: registered.updatedAt,
  });

  const tokenList = await app.request("/api/tokens", {
    headers: authorizedHeaders(),
  });
  assertEquals(await tokenList.json(), [{
    uuid: DYNAMIC_TOKEN_UUID,
    description: "",
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
  }]);
});

Deno.test("Webhook 管理ルートが OpenAPI ドキュメントに含まれる", () => {
  const { discordWebhookAdminRoute, tokenAdminRoute } = createTestRoutes();
  const discordDocument = discordWebhookAdminRoute.getOpenAPI31Document({
    openapi: "3.1.0",
    info: {
      title: "Webhook Admin API",
      version: "latest",
    },
  });
  const tokenDocument = tokenAdminRoute.getOpenAPI31Document({
    openapi: "3.1.0",
    info: {
      title: "Webhook Admin API",
      version: "latest",
    },
  });

  const allPaths = [
    ...Object.keys(discordDocument.paths ?? {}),
    ...Object.keys(tokenDocument.paths ?? {}),
  ].sort();

  assertEquals(allPaths, [
    "/discord/webhooks",
    "/discord/webhooks/{uuid}",
    "/tokens",
    "/tokens/{uuid}",
  ]);
  assertEquals(
    discordDocument.components?.securitySchemes?.["X-Api-Key"],
    {
      type: "apiKey",
      in: "header",
      name: "X-Api-Key",
    },
  );
  assertEquals(
    discordDocument.paths?.["/discord/webhooks"]?.post?.security,
    [{ "X-Api-Key": [] }],
  );
  assertEquals(
    discordDocument.paths?.["/discord/webhooks"]?.post?.responses?.["201"]
      ?.headers,
    {
      "Cache-Control": {
        description: "秘密情報を含むレスポンスがキャッシュされないようにします",
        schema: {
          type: "string",
          example: "no-store",
        },
      },
    },
  );
  assertEquals(
    discordDocument.paths?.["/discord/webhooks/{uuid}"]?.get?.responses?.["200"]
      ?.headers,
    discordDocument.paths?.["/discord/webhooks"]?.post?.responses?.["201"]
      ?.headers,
  );
  assertEquals(
    tokenDocument.paths?.["/tokens"]?.post?.responses?.["201"]?.headers,
    discordDocument.paths?.["/discord/webhooks"]?.post?.responses?.["201"]
      ?.headers,
  );

  const allSchemas = {
    ...discordDocument.components?.schemas,
    ...tokenDocument.components?.schemas,
  };

  const requiredProperties = (schemaName: string) => {
    const schema = allSchemas[schemaName];
    if (schema === undefined || "$ref" in schema) {
      throw new Error(`Expected an inline schema: ${schemaName}`);
    }
    return schema.required;
  };

  assertEquals(
    requiredProperties("CreateRegisteredDiscordWebhookRequest"),
    ["discordWebhookUrl", "description"],
  );
  assertEquals(
    requiredProperties("CreateDynamicWebhookTokenRequest"),
    ["description"],
  );
  assertEquals(
    requiredProperties("RegisteredDiscordWebhookSummary"),
    ["uuid", "description", "createdAt", "updatedAt"],
  );
  assertEquals(
    requiredProperties("CreatedRegisteredDiscordWebhook"),
    [
      "uuid",
      "description",
      "webhookUrl",
      "discordWebhookUrl",
      "createdAt",
    ],
  );
  assertEquals(
    requiredProperties("RegisteredDiscordWebhookDetail"),
    [
      "uuid",
      "description",
      "discordWebhookUrl",
      "webhookUrl",
      "createdAt",
      "updatedAt",
    ],
  );
  assertEquals(
    requiredProperties("UpdateRegisteredDiscordWebhookRequest"),
    ["description"],
  );
  assertEquals(
    requiredProperties("UpdatedRegisteredDiscordWebhook"),
    ["uuid", "description", "createdAt", "updatedAt"],
  );
  assertEquals(
    discordDocument.paths?.["/discord/webhooks/{uuid}"]?.patch?.security,
    [{ "X-Api-Key": [] }],
  );
  assertEquals(
    discordDocument.paths?.["/discord/webhooks/{uuid}"]?.patch?.responses
      ?.["200"]?.headers,
    discordDocument.paths?.["/discord/webhooks"]?.post?.responses?.["201"]
      ?.headers,
  );
  assertEquals(
    requiredProperties("UpdateDynamicWebhookTokenRequest"),
    ["description"],
  );
  assertEquals(
    requiredProperties("UpdatedDynamicWebhookToken"),
    ["uuid", "description", "createdAt", "updatedAt"],
  );
  assertEquals(
    tokenDocument.paths?.["/tokens/{uuid}"]?.patch?.security,
    [{ "X-Api-Key": [] }],
  );
  assertEquals(
    tokenDocument.paths?.["/tokens/{uuid}"]?.patch?.responses?.["200"]
      ?.headers,
    discordDocument.paths?.["/discord/webhooks"]?.post?.responses?.["201"]
      ?.headers,
  );
  assertEquals(
    requiredProperties("DynamicWebhookTokenSummary"),
    ["uuid", "description", "createdAt", "updatedAt"],
  );
  assertEquals(
    requiredProperties("CreatedDynamicWebhookToken"),
    ["uuid", "description", "token", "createdAt"],
  );
});
