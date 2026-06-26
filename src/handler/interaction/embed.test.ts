import { assert, assertEquals } from "@std/assert";
import {
  type APIInteraction,
  type APIInteractionResponseChannelMessageWithSource,
  type APIModalInteractionResponse,
  type APIModalSubmitInteraction,
  ComponentType,
  InteractionResponseType,
} from "discord-api-types/v10";
import { handleCreate as handleCreateDiscordCommand } from "./discord/command/create.ts";
import { handleCreateDiscordWebhookModal } from "./discord/modal/create.ts";
import { DESCRIPTION_MAX_LENGTH } from "./embed.ts";
import { handleUpdate as handleUpdateDiscordCommand } from "./discord/command/update.ts";
import { handleCreate as handleCreateTokenCommand } from "./token/command/create.ts";
import { handleCreateWebhookTokenModal } from "./token/modal/create.ts";
import { handleUpdate as handleUpdateTokenCommand } from "./token/command/update.ts";
import type { GuildContext, InteractionsDependencies } from "./route.ts";

const LONG_DESCRIPTION = "あ".repeat(DESCRIPTION_MAX_LENGTH + 1);
const DESCRIPTION_TOO_LONG_TITLE =
  `利用目的は ${DESCRIPTION_MAX_LENGTH} 文字以内で入力してください`;

const deps = {} as InteractionsDependencies;
const interaction = {} as APIInteraction;
const ctx = {
  guildId: "123456789012345678",
  member: {
    nick: null,
    permissions: "0",
    user: {
      id: "123456789012345678",
      username: "user",
      discriminator: "0",
      global_name: null,
      avatar: null,
    },
  },
} as GuildContext;

const textInputAt = (
  response: APIModalInteractionResponse,
  rowIndex: number,
) => {
  const row = response.data.components[rowIndex];
  assert("components" in row);

  const component = row.components[0];
  assert(component.type === ComponentType.TextInput);

  return component;
};

const modalSubmitInteraction = (
  customId: string,
  fields: { customId: string; value: string }[],
): APIModalSubmitInteraction => ({
  data: {
    custom_id: customId,
    components: fields.map((field) => ({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.TextInput,
          custom_id: field.customId,
          value: field.value,
        },
      ],
    })),
  },
} as unknown as APIModalSubmitInteraction);

const responseEmbed = (
  response: APIInteractionResponseChannelMessageWithSource,
) => response.data.embeds?.[0];

const owner = {
  guildId: ctx.guildId,
  discordUserId: ctx.member.user.id,
  username: ctx.member.user.username,
  globalName: null,
  displayName: null,
  avatarHash: null,
  discriminator: "0",
};

const depsWithLongDescriptions = {
  registeredWebhookUseCase: {
    getRegisteredDiscordWebhook: () =>
      Promise.resolve({
        uuid: "webhook-id",
        description: LONG_DESCRIPTION,
        owner,
        webhookUrl: "https://example.com/discord/webhooks/webhook-id/token",
        discordWebhookUrl:
          "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEF",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      }),
  },
  tokenUseCase: {
    getDynamicWebhookToken: () =>
      Promise.resolve({
        uuid: "token-id",
        description: LONG_DESCRIPTION,
        owner,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      }),
  },
} as unknown as InteractionsDependencies;

Deno.test("create modal は description 入力に max_length を設定する", () => {
  const discordResponse = handleCreateDiscordCommand(
    interaction,
    deps,
  ) as APIModalInteractionResponse;
  const tokenResponse = handleCreateTokenCommand(
    interaction,
    deps,
  ) as APIModalInteractionResponse;

  assertEquals(
    textInputAt(discordResponse, 1).max_length,
    DESCRIPTION_MAX_LENGTH,
  );
  assertEquals(
    textInputAt(tokenResponse, 0).max_length,
    DESCRIPTION_MAX_LENGTH,
  );
});

Deno.test("create modal submit は 200 文字超過の description を拒否する", async () => {
  const discordResponse = await handleCreateDiscordWebhookModal(
    modalSubmitInteraction("webhook.discord.create.modal", [
      {
        customId: "url",
        value:
          "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEF",
      },
      { customId: "description", value: LONG_DESCRIPTION },
    ]),
    deps,
    ctx,
  ) as APIInteractionResponseChannelMessageWithSource;
  const tokenResponse = await handleCreateWebhookTokenModal(
    modalSubmitInteraction("webhook.token.create.modal", [
      { customId: "description", value: LONG_DESCRIPTION },
    ]),
    deps,
    ctx,
  ) as APIInteractionResponseChannelMessageWithSource;

  assertEquals(
    discordResponse.type,
    InteractionResponseType.ChannelMessageWithSource,
  );
  assertEquals(
    responseEmbed(discordResponse)?.title,
    DESCRIPTION_TOO_LONG_TITLE,
  );
  assertEquals(
    tokenResponse.type,
    InteractionResponseType.ChannelMessageWithSource,
  );
  assertEquals(responseEmbed(tokenResponse)?.title, DESCRIPTION_TOO_LONG_TITLE);
});

Deno.test("update modal は過長な既存 description を丸めず拒否する", async () => {
  const discordResponse = await handleUpdateDiscordCommand(
    new Map([["webhook", "webhook-id"]]),
    { id: "123456789012345678" } as APIInteraction,
    depsWithLongDescriptions,
    ctx,
  ) as APIInteractionResponseChannelMessageWithSource;
  const tokenResponse = await handleUpdateTokenCommand(
    new Map([["token", "token-id"]]),
    { id: "123456789012345678" } as APIInteraction,
    depsWithLongDescriptions,
    ctx,
  ) as APIInteractionResponseChannelMessageWithSource;

  assertEquals(
    discordResponse.type,
    InteractionResponseType.ChannelMessageWithSource,
  );
  assertEquals(
    responseEmbed(discordResponse)?.title,
    DESCRIPTION_TOO_LONG_TITLE,
  );
  assertEquals(
    tokenResponse.type,
    InteractionResponseType.ChannelMessageWithSource,
  );
  assertEquals(responseEmbed(tokenResponse)?.title, DESCRIPTION_TOO_LONG_TITLE);
});
