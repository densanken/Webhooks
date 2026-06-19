import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";

import { registeredDiscordWebhookKey } from "../../../infrastructure/kv/discord-key.ts";
import { WebhookRepositoryConflictError } from "../../error/impl.ts";
import {
  discordWebhookUrl,
  ENV_PERMISSION,
  VALID_DISCORD_WEBHOOK_TOKEN,
  withEncryptionKey,
  withMemoryKv,
} from "../../../test-helper/webhook.ts";
import { hashString } from "../../../util/crypto.ts";
import { DiscordRegisteredWebhookRepository } from "./impl.ts";
import type { RegisteredDiscordWebhookKvRecord } from "./record.ts";
import {
  decryptRegisteredDiscordWebhookUrl,
  decryptRegisteredPathToken,
} from "./secret.ts";

Deno.test({
  name:
    "DiscordRegisteredWebhookRepository は平文の秘密情報を保存せずに暗号化レコードを作成する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordRegisteredWebhookRepository(kv);
        const uuid = "registered-1";
        const pathToken = "path-token-plaintext";
        const url = discordWebhookUrl();

        const record = await repository.createRegisteredDiscordWebhook({
          uuid,
          description: "production alerts",
          discordWebhookUrl: url,
          pathToken,
          now: new Date("2026-06-06T00:00:00.000Z"),
        });

        assertEquals(record.uuid, uuid);
        assertEquals(record.description, "production alerts");
        assertEquals(record.discordWebhookUrlHash, await hashString(url));
        assertEquals(record.discordWebhookUrl, url);
        assertEquals(record.pathToken, pathToken);

        const raw = await kv.get<RegisteredDiscordWebhookKvRecord>(
          registeredDiscordWebhookKey(uuid),
        );
        assert(raw.value);
        assertEquals(await decryptRegisteredDiscordWebhookUrl(raw.value), url);
        assertEquals(await decryptRegisteredPathToken(raw.value), pathToken);

        const rawJson = JSON.stringify(raw.value);
        assert(!rawJson.includes(url));
        assert(!rawJson.includes(pathToken));
        assert(!rawJson.includes(VALID_DISCORD_WEBHOOK_TOKEN));
        assertStringIncludes(rawJson, "encryptedDiscordWebhookUrl");
        assertStringIncludes(rawJson, "encryptedPathToken");
      });
    });
  },
});

Deno.test({
  name:
    "DiscordRegisteredWebhookRepository はレコードを取得・一覧表示・更新・削除できる",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordRegisteredWebhookRepository(kv);

        await repository.createRegisteredDiscordWebhook({
          uuid: "registered-1",
          description: "first",
          discordWebhookUrl: discordWebhookUrl(),
          pathToken: "first-token",
          now: new Date("2026-06-06T00:00:00.000Z"),
        });
        await repository.createRegisteredDiscordWebhook({
          uuid: "registered-2",
          discordWebhookUrl: discordWebhookUrl("discordapp.com"),
          pathToken: "second-token",
          now: new Date("2026-06-06T00:00:01.000Z"),
        });

        assertEquals(
          (await repository.listRegisteredDiscordWebhooks()).map((record) =>
            record.uuid
          ),
          [
            "registered-1",
            "registered-2",
          ],
        );

        const found = await repository.getRegisteredDiscordWebhook(
          "registered-1",
        );
        assertEquals(found?.description, "first");

        const updated = await repository.updateRegisteredDiscordWebhook(
          "registered-1",
          {
            description: "updated",
            now: new Date("2026-06-06T00:00:02.000Z"),
          },
        );
        assertEquals(updated?.description, "updated");
        assertEquals(updated?.updatedAt, "2026-06-06T00:00:02.000Z");
        assertEquals(
          await repository.updateRegisteredDiscordWebhook("missing", {}),
          null,
        );

        await repository.deleteRegisteredDiscordWebhook("registered-1");
        assertEquals(
          await repository.getRegisteredDiscordWebhook("registered-1"),
          null,
        );
        assertEquals(
          (await repository.listRegisteredDiscordWebhooks()).map((record) =>
            record.uuid
          ),
          [
            "registered-2",
          ],
        );
      });
    });
  },
});

Deno.test({
  name: "DiscordRegisteredWebhookRepository は重複する UUID を拒否する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withEncryptionKey(async () => {
      await withMemoryKv(async (kv) => {
        const repository = new DiscordRegisteredWebhookRepository(kv);
        const input = {
          uuid: "registered-1",
          discordWebhookUrl: discordWebhookUrl(),
          pathToken: "path-token",
        };

        await repository.createRegisteredDiscordWebhook(input);

        await assertRejects(
          () => repository.createRegisteredDiscordWebhook(input),
          WebhookRepositoryConflictError,
        );
      });
    });
  },
});
