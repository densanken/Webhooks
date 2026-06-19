import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";

import { dynamicWebhookTokenKey } from "../../infrastructure/kv/token-key.ts";
import { WebhookRepositoryConflictError } from "../error/impl.ts";
import { ENV_PERMISSION, withMemoryKv } from "../../test-helper/webhook.ts";
import { verifyBearerTokenHash } from "../../util/crypto.ts";
import type { WebhookTokenRecord } from "./interface.ts";
import { WebhookTokenRepository } from "./impl.ts";

Deno.test({
  name:
    "WebhookTokenRepository は Bearer トークンのハッシュだけを持つレコードを作成する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withMemoryKv(async (kv) => {
      const repository = new WebhookTokenRepository(kv);
      const uuid = "token-1";
      const token = "a".repeat(43);

      const record = await repository.createDynamicWebhookToken({
        uuid,
        description: "deploy hook",
        token,
        now: new Date("2026-06-06T00:00:00.000Z"),
      });

      assertEquals(record.uuid, uuid);
      assertEquals(record.description, "deploy hook");
      assertEquals(await verifyBearerTokenHash(token, record.tokenHash), true);

      const raw = await kv.get<WebhookTokenRecord>(
        dynamicWebhookTokenKey(uuid),
      );
      assert(raw.value);

      const rawJson = JSON.stringify(raw.value);
      assert(!rawJson.includes(token));
      assertStringIncludes(rawJson, "tokenHash");
    });
  },
});

Deno.test({
  name: "WebhookTokenRepository はレコードを取得・一覧表示・更新・削除できる",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withMemoryKv(async (kv) => {
      const repository = new WebhookTokenRepository(kv);

      await repository.createDynamicWebhookToken({
        uuid: "token-1",
        description: "first",
        token: "a".repeat(43),
        now: new Date("2026-06-06T00:00:00.000Z"),
      });
      await repository.createDynamicWebhookToken({
        uuid: "token-2",
        token: "b".repeat(43),
        now: new Date("2026-06-06T00:00:01.000Z"),
      });

      assertEquals(
        (await repository.listDynamicWebhookTokens()).map((record) =>
          record.uuid
        ),
        [
          "token-1",
          "token-2",
        ],
      );

      const found = await repository.getDynamicWebhookToken("token-1");
      assertEquals(found?.description, "first");

      const updated = await repository.updateDynamicWebhookToken("token-1", {
        description: "updated",
        now: new Date("2026-06-06T00:00:02.000Z"),
      });
      assertEquals(updated?.description, "updated");
      assertEquals(updated?.updatedAt, "2026-06-06T00:00:02.000Z");

      const partialUpdated = await repository.updateDynamicWebhookToken(
        "token-1",
        { now: new Date("2026-06-06T00:00:03.000Z") },
      );
      assertEquals(partialUpdated?.description, "updated");
      assertEquals(partialUpdated?.updatedAt, "2026-06-06T00:00:03.000Z");

      assertEquals(
        await repository.updateDynamicWebhookToken("missing", {}),
        null,
      );

      await repository.deleteDynamicWebhookToken("token-1");
      assertEquals(await repository.getDynamicWebhookToken("token-1"), null);
      assertEquals(
        (await repository.listDynamicWebhookTokens()).map((record) =>
          record.uuid
        ),
        [
          "token-2",
        ],
      );
    });
  },
});

Deno.test({
  name: "WebhookTokenRepository は重複する UUID を拒否する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withMemoryKv(async (kv) => {
      const repository = new WebhookTokenRepository(kv);
      const input = {
        uuid: "token-1",
        token: "a".repeat(43),
      };

      await repository.createDynamicWebhookToken(input);

      await assertRejects(
        () => repository.createDynamicWebhookToken(input),
        WebhookRepositoryConflictError,
      );
    });
  },
});

Deno.test({
  name: "WebhookTokenRepository は無効な Bearer トークンを拒否する",
  permissions: ENV_PERMISSION,
  fn: async () => {
    await withMemoryKv(async (kv) => {
      const repository = new WebhookTokenRepository(kv);

      await assertRejects(
        () =>
          repository.createDynamicWebhookToken({
            uuid: "token-1",
            token: "short-token",
          }),
        TypeError,
        "Bearer token must be 43-character base64url",
      );
      await assertRejects(
        () =>
          repository.createDynamicWebhookToken({
            uuid: "token-2",
            token: `${"a".repeat(42)}!`,
          }),
        TypeError,
        "Bearer token must be 43-character base64url",
      );

      assertEquals(await repository.getDynamicWebhookToken("token-1"), null);
      assertEquals(await repository.getDynamicWebhookToken("token-2"), null);
      assertEquals(await repository.listDynamicWebhookTokens(), []);
    });
  },
});
