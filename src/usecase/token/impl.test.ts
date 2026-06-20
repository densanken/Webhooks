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

Deno.test(
  "WebhookTokenUseCase は description を省略して更新しても既存の description を保持する",
  async () => {
    const repository = new MockWebhookTokenRepository();
    const token = "a".repeat(43);
    const usecase = new WebhookTokenUseCase(repository, {
      generateUuid: () => "token-1",
      generateToken: () => token,
    });

    await usecase.createDynamicWebhookToken({
      description: "original description",
      now: new Date("2026-06-06T00:00:00.000Z"),
    });

    const updated = await usecase.updateDynamicWebhookToken("token-1", {
      now: new Date("2026-06-07T00:00:00.000Z"),
    });

    assertEquals(updated, {
      uuid: "token-1",
      description: "original description",
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
    });
  },
);

Deno.test(
  "WebhookTokenUseCase は description を明示して更新できる",
  async () => {
    const repository = new MockWebhookTokenRepository();
    const token = "a".repeat(43);
    const usecase = new WebhookTokenUseCase(repository, {
      generateUuid: () => "token-1",
      generateToken: () => token,
    });

    await usecase.createDynamicWebhookToken({
      description: "original description",
      now: new Date("2026-06-06T00:00:00.000Z"),
    });

    const updated = await usecase.updateDynamicWebhookToken("token-1", {
      description: "new description",
      now: new Date("2026-06-07T00:00:00.000Z"),
    });

    assertEquals(updated, {
      uuid: "token-1",
      description: "new description",
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
    });
  },
);

Deno.test(
  "WebhookTokenUseCase は存在しない uuid の更新で null を返す",
  async () => {
    const repository = new MockWebhookTokenRepository();
    const usecase = new WebhookTokenUseCase(repository, {});

    const result = await usecase.updateDynamicWebhookToken("nonexistent", {
      description: "desc",
    });
    assertEquals(result, null);
  },
);
