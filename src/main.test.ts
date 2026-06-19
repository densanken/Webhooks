import { assertEquals } from "@std/assert";

import { withMemoryKv } from "./test-helper/webhook.ts";
import { createApp } from "./main.ts";

Deno.test("createApp は /api を API キーで保護する", async () => {
  await withMemoryKv(async (kv) => {
    const app = await createApp({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: {
        clientId: "test",
        clientSecret: "test",
        allowedGuildIds: ["test"],
        sessionSecret: "test-session-secret",
      },
      publicBaseUrl: "https://example.com",
    });

    const unauthorized = await app.request("/api/tokens");
    assertEquals(unauthorized.status, 401);

    const authorized = await app.request("/api/tokens", {
      headers: { "X-Api-Key": "test-api-key" },
    });
    assertEquals(authorized.status, 200);
  });
});

Deno.test("createApp は /discord を API キーなしで公開する", async () => {
  await withMemoryKv(async (kv) => {
    const app = await createApp({
      kv,
      apiKeys: ["test-api-key"],
      docAuth: {
        clientId: "test",
        clientSecret: "test",
        allowedGuildIds: ["test"],
        sessionSecret: "test-session-secret",
      },
      publicBaseUrl: "https://example.com",
    });

    const registered = await app.request(
      "/discord/webhooks/unknown/path-token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "hello" }),
      },
    );
    assertEquals(registered.status, 404);
    assertEquals((await registered.json()).code, "not_found");

    const dynamic = await app.request("/discord/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });
    assertEquals(dynamic.status, 401);
    assertEquals((await dynamic.json()).code, "unauthorized");
  });
});
