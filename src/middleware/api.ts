import { createMiddleware } from "hono/factory";

import { timingSafeIncludes } from "../util/crypto.ts";

const API_KEYS_ENV = "API_KEYS";

export const getConfiguredApiKeys = (): string[] =>
  Deno.env.get(API_KEYS_ENV)
    ?.split(",")
    .map((apiKey) => apiKey.trim())
    .filter((apiKey) => apiKey.length > 0) ?? [];

export const createApiKeyMiddleware = (
  apiKeys: readonly string[] = getConfiguredApiKeys(),
) =>
  createMiddleware(async (c, next) => {
    const apiKey = c.req.header("X-Api-Key");

    if (apiKey === undefined || !timingSafeIncludes(apiKeys, apiKey)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  });
