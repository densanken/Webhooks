import { assertEquals } from "@std/assert";

import { MockWebhookTokenRepository } from "../../repository/token/impl.mock.ts";
import { verifyBearerTokenHash } from "../../util/crypto.ts";
import { WebhookTokenUseCase } from "./impl.ts";

Deno.test(
  "WebhookTokenUseCase は動的トークンを作成・一覧表示・削除できる",
  async () => {
    const repository = new MockWebhookTokenRepository();
    const token = "a".repeat(43);
    const usecase = new WebhookTokenUseCase(repository, {
      generateUuid: () => "token-1",
      generateToken: () => token,
    });

    const created = await usecase.createDynamicWebhookToken({
      description: "deploy hook",
      now: new Date("2026-06-06T00:00:00.000Z"),
    });

    assertEquals(created, {
      uuid: "token-1",
      description: "deploy hook",
      token,
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z",
    });
    assertEquals(await usecase.listDynamicWebhookTokens(), [{
      uuid: "token-1",
      description: "deploy hook",
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z",
    }]);

    const record = await repository.getDynamicWebhookToken("token-1");
    assertEquals(record?.tokenHash.includes(token), false);
    assertEquals(
      await verifyBearerTokenHash(token, record?.tokenHash ?? ""),
      true,
    );

    assertEquals(await usecase.revokeDynamicWebhookToken("token-1"), true);
    assertEquals(await usecase.revokeDynamicWebhookToken("token-1"), false);
    assertEquals(await repository.getDynamicWebhookToken("token-1"), null);
  },
);
