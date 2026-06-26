import { assertEquals } from "@std/assert";

import { MockGuildWebhooksRepository } from "../../../repository/discord/guild-webhooks/impl.mock.ts";
import { GuildWebhooksUseCase } from "./impl.ts";

const GUILD_ID = "guild-1";

const makeFetcher = (
  webhooks: {
    id: string;
    type: number;
    channel_id: string | null;
    name: string | null;
    token?: string;
  }[],
) =>
(_input: string | URL | Request): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(webhooks), { status: 200 }));

Deno.test(
  "GuildWebhooksUseCase は Incoming webhook (type 1 かつ token あり) のみキャッシュする",
  async () => {
    const repository = new MockGuildWebhooksRepository();
    const usecase = new GuildWebhooksUseCase(repository, {
      botToken: "test-token",
      fetcher: makeFetcher([
        {
          id: "wh-incoming",
          type: 1,
          channel_id: "ch-1",
          name: "incoming",
          token: "tok-abc",
        },
        {
          id: "wh-follower",
          type: 2,
          channel_id: "ch-2",
          name: "channel follower",
          // token なし
        },
        {
          id: "wh-follower-as-type1",
          type: 1,
          channel_id: "ch-3",
          name: "channel follower returned as type 1",
          // token なし → 除外される
        },
        { id: "wh-app", type: 3, channel_id: null, name: "application" },
      ]),
    });

    const result = await usecase.syncGuildWebhooks(GUILD_ID);

    assertEquals(result.fetched, 1);
    assertEquals(result.added, 1);
    assertEquals(result.updated, 0);
    assertEquals(result.removed, 0);

    assertEquals(await usecase.isGuildWebhook(GUILD_ID, "wh-incoming"), true);
    assertEquals(await usecase.isGuildWebhook(GUILD_ID, "wh-follower"), false);
    assertEquals(
      await usecase.isGuildWebhook(GUILD_ID, "wh-follower-as-type1"),
      false,
    );
    assertEquals(await usecase.isGuildWebhook(GUILD_ID, "wh-app"), false);
  },
);

Deno.test(
  "GuildWebhooksUseCase は sync 後に Channel Follower が削除されてもキャッシュに影響しない",
  async () => {
    const repository = new MockGuildWebhooksRepository();
    const usecase = new GuildWebhooksUseCase(repository, {
      botToken: "test-token",
      fetcher: makeFetcher([
        {
          id: "wh-a",
          type: 1,
          channel_id: "ch-1",
          name: "webhook A",
          token: "tok-a",
        },
        {
          id: "wh-b",
          type: 1,
          channel_id: "ch-2",
          name: "webhook B",
          token: "tok-b",
        },
        { id: "wh-follower", type: 2, channel_id: "ch-3", name: "follower" },
      ]),
    });

    const first = await usecase.syncGuildWebhooks(GUILD_ID);
    assertEquals(first.fetched, 2);
    assertEquals(first.added, 2);

    const second = await usecase.syncGuildWebhooks(GUILD_ID);
    assertEquals(second.fetched, 2);
    assertEquals(second.added, 0);
    assertEquals(second.updated, 2);
    assertEquals(second.removed, 0);
  },
);

Deno.test(
  "GuildWebhooksUseCase isGuildWebhookWithRefresh はキャッシュミス時に sync して再確認する",
  async () => {
    const repository = new MockGuildWebhooksRepository();
    const usecase = new GuildWebhooksUseCase(repository, {
      botToken: "test-token",
      fetcher: makeFetcher([
        {
          id: "wh-new",
          type: 1,
          channel_id: "ch-1",
          name: "new webhook",
          token: "tok-new",
        },
        { id: "wh-follower", type: 2, channel_id: "ch-2", name: "follower" },
      ]),
    });

    assertEquals(
      await usecase.isGuildWebhookWithRefresh(GUILD_ID, "wh-new"),
      true,
    );
    assertEquals(
      await usecase.isGuildWebhookWithRefresh(GUILD_ID, "wh-follower"),
      false,
    );
  },
);
