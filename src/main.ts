// Discord ディスパッチャーの Deno.cron ジョブをトップレベルで登録する
import "./job/discord/dispatcher.ts";

import { Hono } from "hono";

import { Kv } from "./infrastructure/kv/client.ts";
import { redactingLogger } from "./middleware/logger.ts";
import {
  createApiRoute,
  type CreateApiRouteOptions,
} from "./handler/admin/route.ts";
import { createDiscordWebhookRoute } from "./handler/public/discord/route.ts";

export const createApp = async (
  options: CreateApiRouteOptions = {},
) => {
  const kv = options.kv ?? await Kv.getKv();

  return new Hono({ strict: false })
    .use(async (c, next) => {
      await next();
      c.header("X-Content-Type-Options", "nosniff");
    })
    .use(redactingLogger())
    .route("/api", await createApiRoute({ ...options, kv }))
    .route("/discord", await createDiscordWebhookRoute({ kv }));
};

if (import.meta.main) {
  const app = await createApp();
  Deno.serve(app.fetch);
}
