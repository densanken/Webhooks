import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Hono } from "hono";

import { createSessionValue } from "../../middleware/doc.ts";
import { withMemoryKv } from "../../test-helper/webhook.ts";
import { createApiRoute } from "./route.ts";
import { type DocOAuthConfig, parseAllowedGuildIds } from "./doc-oauth.ts";

const TEST_SESSION_SECRET = "test-session-secret-for-hmac-signing";

const TEST_DOC_AUTH: DocOAuthConfig = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  allowedGuildIds: ["123456789"],
  sessionSecret: TEST_SESSION_SECRET,
  publicBaseUrl: "https://example.com",
};

const LOGIN_PATH = "/api/doc/login";
const LOGOUT_PATH = "/api/doc/logout";
const CALLBACK_PATH = "/api/doc/auth/oauth2/callback/discord";

const DISCORD_OAUTH2_ME_RESPONSE = {
  application: {
    id: "app-1",
    name: "test",
    icon: null,
    description: "",
    type: "",
    bot: {
      id: "bot-1",
      username: "test",
      avatar: null,
      discriminator: "0",
      public_flags: 0,
      premium_type: 0,
      flags: 0,
      bot: true,
      banner: null,
      accent_color: null,
      global_name: null,
      avatar_decoration_data: null,
      banner_color: null,
    },
    summary: "",
    bot_public: true,
    bot_require_code_grant: false,
    verify_key: "",
    flags: 0,
    hook: true,
    is_monetized: false,
  },
  expires: new Date(Date.now() + 604800000).toISOString(),
  scopes: ["identify", "guilds"],
  user: {
    id: "user-123",
    username: "testuser",
    avatar: "",
    discriminator: "0",
    public_flags: 0,
    premium_type: 0,
    flags: 0,
    banner: null,
    accent_color: null,
    global_name: "Test",
    avatar_decoration_data: null,
    banner_color: null,
  },
};

const createMockFetch = (
  overrides: {
    guilds?: unknown;
    guildsOk?: boolean;
    oauthMe?: unknown;
    oauthMeOk?: boolean;
    tokenOk?: boolean;
  } = {},
): typeof globalThis.fetch => {
  const {
    guilds = [{ id: "123456789" }],
    guildsOk = true,
    oauthMe = DISCORD_OAUTH2_ME_RESPONSE,
    oauthMeOk = true,
    tokenOk = true,
  } = overrides;

  return ((
    input: string | URL | Request,
  ): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

    if (url.includes("/oauth2/token")) {
      if (!tokenOk) {
        return Promise.resolve(new Response("error", { status: 400 }));
      }
      return Promise.resolve(
        Response.json({
          access_token: "mock-access-token",
          token_type: "Bearer",
          expires_in: 604800,
          refresh_token: "mock-refresh-token",
          scope: "identify guilds",
        }),
      );
    }

    if (url.includes("/oauth2/@me")) {
      if (!oauthMeOk) {
        return Promise.resolve(new Response("error", { status: 400 }));
      }
      return Promise.resolve(Response.json(oauthMe));
    }

    if (url.includes("/users/@me/guilds")) {
      if (!guildsOk) {
        return Promise.resolve(new Response("error", { status: 400 }));
      }
      return Promise.resolve(Response.json(guilds));
    }

    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof globalThis.fetch;
};

const withMockFetch = async (
  mockFetch: typeof globalThis.fetch,
  fn: () => Promise<void>,
) => {
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
};

const findStateSetCookie = (response: Response): string | undefined =>
  response.headers.getSetCookie().find((c) => c.startsWith("doc_oauth_state="));

const findProviderStateSetCookie = (response: Response): string | undefined =>
  response.headers.getSetCookie().find((c) => c.startsWith("state="));

const extractOAuthCookies = (response: Response): string =>
  response.headers
    .getSetCookie()
    .filter((cookie) =>
      cookie.startsWith("doc_oauth_state=") ||
      cookie.startsWith("state=") ||
      cookie.startsWith("doc_oauth_redirect=")
    )
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

const extractStateFromRedirect = (response: Response): string => {
  const location = response.headers.get("location")!;
  return new URL(location).searchParams.get("state")!;
};

Deno.test("未認証のドキュメントアクセスはログインにリダイレクトされる", async () => {
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: { ...TEST_DOC_AUTH, fetchFn: createMockFetch() },
      publicBaseUrl: "https://example.com",
    });
    const app = new Hono({ strict: false }).route("/api", route);

    const docRes = await app.request("/api/doc");
    assertEquals(docRes.status, 302);
    assertEquals(
      docRes.headers.get("location"),
      `${LOGIN_PATH}?redirect=%2Fapi%2Fdoc`,
    );

    const uiRes = await app.request("/api/doc/ui");
    assertEquals(uiRes.status, 302);
    assertEquals(
      uiRes.headers.get("location"),
      `${LOGIN_PATH}?redirect=%2Fapi%2Fdoc%2Fui`,
    );
  });
});

Deno.test("ログインは Discord OAuth にリダイレクトされる", async () => {
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: { ...TEST_DOC_AUTH, fetchFn: createMockFetch() },
      publicBaseUrl: "https://example.com",
    });
    const app = new Hono({ strict: false }).route("/api", route);

    const res = await app.request("/api/doc/login");
    assertEquals(res.status, 302);

    const location = res.headers.get("location")!;
    assert(location.startsWith("https://discord.com/oauth2/authorize"));
    const params = new URL(location).searchParams;
    assertEquals(params.get("client_id"), "test-client-id");
    assertEquals(
      params.get("redirect_uri"),
      `https://example.com${CALLBACK_PATH}`,
    );
    assertEquals(params.get("response_type"), "code");
    assertEquals(params.get("scope"), "identify guilds");

    const stateSetCookie = findStateSetCookie(res) ?? "";
    assertStringIncludes(stateSetCookie, "doc_oauth_state=");
    assertStringIncludes(stateSetCookie, "HttpOnly");
    assertStringIncludes(stateSetCookie, "SameSite=Lax");
    assertStringIncludes(stateSetCookie, "Path=/api/doc");
    const providerStateSetCookie = findProviderStateSetCookie(res) ?? "";
    assertStringIncludes(providerStateSetCookie, "state=");
    assertStringIncludes(providerStateSetCookie, "HttpOnly");
    assertStringIncludes(providerStateSetCookie, "SameSite=Lax");
    assertStringIncludes(providerStateSetCookie, "Path=/api/doc");
  });
});

Deno.test("コールバックはコードを交換してセッション Cookie を設定する", async () => {
  const mockFetch = createMockFetch();
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: { ...TEST_DOC_AUTH, fetchFn: mockFetch },
      publicBaseUrl: "https://example.com",
    });
    const app = new Hono({ strict: false }).route("/api", route);

    await withMockFetch(mockFetch, async () => {
      const loginRes = await app.request("/api/doc/login");
      const oauthCookies = extractOAuthCookies(loginRes);
      const state = extractStateFromRedirect(loginRes);

      const callbackRes = await app.request(
        `${CALLBACK_PATH}?code=test-auth-code&state=${state}`,
        { headers: { Cookie: oauthCookies } },
      );
      assertEquals(callbackRes.status, 302);
      assertEquals(callbackRes.headers.get("location"), "/api/doc/ui");

      const setCookies = callbackRes.headers.getSetCookie();
      const sessionCookie = setCookies.find((c) =>
        c.startsWith("doc_session=")
      );
      assert(sessionCookie);
      assertStringIncludes(sessionCookie, "HttpOnly");
      assertStringIncludes(sessionCookie, "SameSite=Lax");
      assertStringIncludes(sessionCookie, "Path=/api/doc");
    });
  });
});

Deno.test("コールバックはログイン前のアクセス URL に戻る", async () => {
  const mockFetch = createMockFetch();
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: { ...TEST_DOC_AUTH, fetchFn: mockFetch },
      publicBaseUrl: "https://example.com",
    });
    const app = new Hono({ strict: false }).route("/api", route);

    await withMockFetch(mockFetch, async () => {
      const redirectToLoginRes = await app.request("/api/doc/ui");
      const loginRes = await app.request(
        redirectToLoginRes.headers.get("location")!,
      );
      const oauthCookies = extractOAuthCookies(loginRes);
      const state = extractStateFromRedirect(loginRes);

      const callbackRes = await app.request(
        `${CALLBACK_PATH}?code=test-auth-code&state=${state}`,
        { headers: { Cookie: oauthCookies } },
      );
      assertEquals(callbackRes.status, 302);
      assertEquals(callbackRes.headers.get("location"), "/api/doc/ui");
    });
  });
});

Deno.test("OAuth Cookie は HTTPS 上で Secure 属性を使用する", async () => {
  const mockFetch = createMockFetch();
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: { ...TEST_DOC_AUTH, fetchFn: mockFetch },
      publicBaseUrl: "https://example.com",
    });

    const loginRes = await route.request("https://example.com/doc/login");
    assertStringIncludes(
      findStateSetCookie(loginRes) ?? "",
      "Secure",
    );
    assertStringIncludes(
      findProviderStateSetCookie(loginRes) ?? "",
      "Secure",
    );
    const oauthCookies = extractOAuthCookies(loginRes);
    const state = extractStateFromRedirect(loginRes);

    await withMockFetch(mockFetch, async () => {
      const callbackRes = await route.request(
        `https://example.com/doc/auth/oauth2/callback/discord?code=test-auth-code&state=${state}`,
        { headers: { Cookie: oauthCookies } },
      );
      assertEquals(callbackRes.status, 302);
      assertStringIncludes(
        callbackRes.headers.getSetCookie().find((c) =>
          c.startsWith("doc_session=")
        ) ?? "",
        "Secure",
      );
    });
  });
});

Deno.test("コールバックは無効な state を拒否する", async () => {
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: { ...TEST_DOC_AUTH, fetchFn: createMockFetch() },
      publicBaseUrl: "https://example.com",
    });
    const app = new Hono({ strict: false }).route("/api", route);

    const res = await app.request(
      `${CALLBACK_PATH}?code=test-auth-code&state=invalid-state`,
    );
    assertEquals(res.status, 400);
    const body = await res.json();
    assertStringIncludes(body.error, LOGOUT_PATH);
    assertEquals(body.logoutUrl, LOGOUT_PATH);
  });
});

Deno.test("コールバックは許可されたギルドに所属しないユーザーをログアウトへリダイレクトする", async () => {
  const mockFetch = createMockFetch({ guilds: [{ id: "other-guild" }] });
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: {
        ...TEST_DOC_AUTH,
        fetchFn: mockFetch,
      },
      publicBaseUrl: "https://example.com",
    });
    const app = new Hono({ strict: false }).route("/api", route);

    await withMockFetch(mockFetch, async () => {
      const loginRes = await app.request("/api/doc/login");
      const oauthCookies = extractOAuthCookies(loginRes);
      const state = extractStateFromRedirect(loginRes);

      const callbackRes = await app.request(
        `${CALLBACK_PATH}?code=test-auth-code&state=${state}`,
        { headers: { Cookie: oauthCookies } },
      );
      assertEquals(callbackRes.status, 302);
      assertEquals(
        callbackRes.headers.get("location"),
        `${LOGOUT_PATH}?reason=not_allowed`,
      );
    });
  });
});

Deno.test("コールバックは形式が不正なギルドレスポンスを拒否する", async () => {
  const mockFetch = createMockFetch({ guilds: { id: "123456789" } });
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: {
        ...TEST_DOC_AUTH,
        fetchFn: mockFetch,
      },
      publicBaseUrl: "https://example.com",
    });
    const app = new Hono({ strict: false }).route("/api", route);

    await withMockFetch(mockFetch, async () => {
      const loginRes = await app.request("/api/doc/login");
      const oauthCookies = extractOAuthCookies(loginRes);
      const state = extractStateFromRedirect(loginRes);

      const callbackRes = await app.request(
        `${CALLBACK_PATH}?code=test-auth-code&state=${state}`,
        { headers: { Cookie: oauthCookies } },
      );
      assertEquals(callbackRes.status, 502);
      const body = await callbackRes.json();
      assertStringIncludes(body.error, "Invalid guilds response");
      assertStringIncludes(body.error, LOGOUT_PATH);
      assertEquals(body.logoutUrl, LOGOUT_PATH);
    });
  });
});

Deno.test("有効なセッション Cookie でドキュメントと UI にアクセスできる", async () => {
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: { ...TEST_DOC_AUTH, fetchFn: createMockFetch() },
      publicBaseUrl: "https://example.com",
    });
    const app = new Hono({ strict: false }).route("/api", route);

    const session = await createSessionValue("user-123", TEST_SESSION_SECRET);
    const cookie = `doc_session=${session}`;

    const docRes = await app.request("/api/doc", {
      headers: { Cookie: cookie },
    });
    assertEquals(docRes.status, 200);
    assertEquals(docRes.headers.get("cache-control"), "no-store");
    assertEquals(docRes.headers.get("referrer-policy"), "no-referrer");
    const document = await docRes.json();
    assertEquals(document.openapi, "3.1.0");
    assertEquals(document.info.title, "Personal Webhook Admin API");
    assert(document.paths["/api/discord/webhooks"]);
    assert(document.paths["/api/tokens"]);
    assert(document.paths["/discord/webhooks"]);

    const uiRes = await app.request("/api/doc/ui", {
      headers: { Cookie: cookie },
    });
    assertEquals(uiRes.status, 200);
    assertEquals(uiRes.headers.get("cache-control"), "no-store");
    assertStringIncludes(
      uiRes.headers.get("content-type") ?? "",
      "text/html",
    );
    assertStringIncludes(
      await uiRes.text(),
      "Personal Webhook Admin API Reference",
    );
  });
});

Deno.test("ログアウトはセッション Cookie をクリアする", async () => {
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: { ...TEST_DOC_AUTH, fetchFn: createMockFetch() },
      publicBaseUrl: "https://example.com",
    });
    const app = new Hono({ strict: false }).route("/api", route);

    const session = await createSessionValue("user-123", TEST_SESSION_SECRET);
    const res = await app.request(LOGOUT_PATH, {
      headers: { Cookie: `doc_session=${session}` },
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertStringIncludes(body.message, "successfully");
    assertEquals(body.loginUrl, LOGIN_PATH);
    const setCookies = res.headers.getSetCookie();
    const clearedCookie = setCookies.find((c) => c.startsWith("doc_session="));
    assert(clearedCookie);
  });
});

Deno.test("not allowed のログアウトはメッセージを返す", async () => {
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: { ...TEST_DOC_AUTH, fetchFn: createMockFetch() },
      publicBaseUrl: "https://example.com",
    });
    const app = new Hono({ strict: false }).route("/api", route);

    const res = await app.request(`${LOGOUT_PATH}?reason=not_allowed`);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertStringIncludes(
      body.message,
      "Discord account is not a member of an allowed server",
    );
    assertEquals(body.loginUrl, LOGIN_PATH);
  });
});

Deno.test("OAuth 設定がない場合ドキュメントは 503 を返す", async () => {
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: null,
      publicBaseUrl: "https://example.com",
    });
    const app = new Hono({ strict: false }).route("/api", route);

    assertEquals((await app.request("/api/doc")).status, 503);
    assertEquals((await app.request("/api/doc/ui")).status, 503);
  });
});

Deno.test("管理ルートは引き続き X-Api-Key を要求する", async () => {
  await withMemoryKv(async (kv) => {
    const route = await createApiRoute({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: { ...TEST_DOC_AUTH, fetchFn: createMockFetch() },
      publicBaseUrl: "https://example.com",
    });
    const app = new Hono({ strict: false }).route("/api", route);

    assertEquals((await app.request("/api/tokens")).status, 401);
  });
});

Deno.test("parseAllowedGuildIds はカンマ区切りのギルド ID をトリムする", () => {
  assertEquals(parseAllowedGuildIds(" 123456789, 987654321 ,,"), [
    "123456789",
    "987654321",
  ]);
});
