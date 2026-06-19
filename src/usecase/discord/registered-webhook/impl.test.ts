import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";

import { MockDiscordRegisteredWebhookRepository } from "../../../repository/discord/registered-webhook/impl.mock.ts";
import {
  discordWebhookUrl,
  ENV_PERMISSION,
  withEncryptionKey,
} from "../../../test-helper/webhook.ts";
import { UseCaseError } from "../../error/impl.ts";
import { DiscordRegisteredWebhookUseCase } from "./impl.ts";

Deno.test({
  name:
    "DiscordRegisteredWebhookUseCase は登録済み Webhook を作成・一覧表示・取得・削除できる",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const usecase = new DiscordRegisteredWebhookUseCase(
        new MockDiscordRegisteredWebhookRepository(),
        {
          publicBaseUrl: "https://example.com/",
          generateUuid: () => "registered-1",
          generateToken: () => "path-token",
        },
      );

      const created = await usecase.createRegisteredDiscordWebhook({
        description: "production alerts",
        discordWebhookUrl: discordWebhookUrl(),
        now: new Date("2026-06-06T00:00:00.000Z"),
      });

      assertEquals(created, {
        uuid: "registered-1",
        description: "production alerts",
        webhookUrl:
          "https://example.com/discord/webhooks/registered-1/path-token",
        discordWebhookUrl: discordWebhookUrl(),
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
      });

      assertEquals(await usecase.listRegisteredDiscordWebhooks(), [{
        uuid: "registered-1",
        description: "production alerts",
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
      }]);

      const detail = await usecase.getRegisteredDiscordWebhook("registered-1");
      assertEquals(detail?.webhookUrl, created.webhookUrl);
      assertEquals(detail?.discordWebhookUrl, discordWebhookUrl());
      assertEquals(
        await usecase.revokeRegisteredDiscordWebhook("registered-1"),
        true,
      );
      assertEquals(
        await usecase.revokeRegisteredDiscordWebhook("registered-1"),
        false,
      );
      assertEquals(
        await usecase.getRegisteredDiscordWebhook("registered-1"),
        null,
      );
    });
  },
});

Deno.test({
  name:
    "DiscordRegisteredWebhookUseCase は無効な Discord Webhook URL をエラーに変換する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      const usecase = new DiscordRegisteredWebhookUseCase(
        new MockDiscordRegisteredWebhookRepository(),
        {
          generateUuid: () => "registered-1",
          generateToken: () => "path-token",
        },
      );

      const error = await assertRejects(
        () =>
          usecase.createRegisteredDiscordWebhook({
            discordWebhookUrl: "https://example.com/not-discord",
          }),
        UseCaseError,
      );

      assertEquals(error.code, "invalid_discord_webhook_url");
      assertEquals(error.status, 400);
      assertStringIncludes(error.message, "host");
    });
  },
});
