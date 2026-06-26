import {
  type APIApplicationCommandAutocompleteInteraction,
  type APIApplicationCommandInteraction,
  type APIInteraction,
  type APIInteractionGuildMember,
  type APIInteractionResponse,
  type APIMessageComponentInteraction,
  type APIModalSubmitInteraction,
  type APIUser,
  InteractionResponseType,
  InteractionType,
} from "discord-api-types/v10";
import type { InteractionsDependencies } from "./route.ts";

import { resolveCommand } from "./commands.ts";
import { isAllowedGuild } from "./permissions.ts";
import { EmbedColor, ephemeralMessage, pongResponse } from "./response.ts";
import { discordCommand } from "./discord/command/index.ts";
import { tokenCommand } from "./token/command/index.ts";

import { handleDiscordWebhookAutocomplete } from "./discord/autocomplete.ts";
import { handleWebhookTokenAutocomplete } from "./token/autocomplete.ts";
import { handleConfirmDiscordWebhookDelete } from "./discord/command/delete.ts";
import { handleConfirmWebhookTokenDelete } from "./token/command/delete.ts";
import { handleListPage as handleDiscordListPage } from "./discord/command/list.ts";
import { handleListPage as handleTokenListPage } from "./token/command/list.ts";
import { handleCreateDiscordWebhookModal } from "./discord/modal/create.ts";
import { handleUpdateDiscordWebhookModal } from "./discord/modal/update.ts";
import { handleCreateWebhookTokenModal } from "./token/modal/create.ts";
import { handleUpdateWebhookTokenModal } from "./token/modal/update.ts";

export type GuildContext = {
  guildId: string;
  member: APIInteractionGuildMember & { user: APIUser };
};

const COMMAND_GROUPS = [discordCommand, tokenCommand];

export const dispatchInteraction = (
  interaction: APIInteraction,
  deps: InteractionsDependencies,
): Promise<APIInteractionResponse> | APIInteractionResponse => {
  if (interaction.type === InteractionType.Ping) {
    return pongResponse();
  }

  const guildId = "guild_id" in interaction ? interaction.guild_id : undefined;

  if (!guildId) {
    return ephemeralMessage({
      title: "サーバー情報を取得できませんでした",
      color: EmbedColor.Error,
      footer: {
        text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
      },
    });
  }

  if (!isAllowedGuild(guildId, deps.env.discordAllowedGuildIds)) {
    return ephemeralMessage({
      title: "このサーバーでは利用できません",
      description: "あなたのサーバーは利用を許可されていないようです",
      color: EmbedColor.Error,
      footer: {
        text: "Bot 管理者にお問い合わせください",
      },
    });
  }

  const member = "member" in interaction ? interaction.member : undefined;
  if (!member) {
    return ephemeralMessage({
      title: "あなたの情報を取得できませんでした",
      color: EmbedColor.Error,
      footer: {
        text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
      },
    });
  }
  if (!member.user) {
    return ephemeralMessage({
      title: "あなたの情報を取得できませんでした",
      color: EmbedColor.Error,
      footer: {
        text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
      },
    });
  }

  const ctx: GuildContext = {
    guildId,
    member: member as GuildContext["member"],
  };

  if (interaction.type === InteractionType.ApplicationCommand) {
    return dispatchCommand(
      interaction as APIApplicationCommandInteraction,
      deps,
      ctx,
    );
  }

  if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
    return dispatchAutocomplete(
      interaction as APIApplicationCommandAutocompleteInteraction,
      deps,
      ctx,
    );
  }

  if (interaction.type === InteractionType.MessageComponent) {
    return dispatchComponent(
      interaction as APIMessageComponentInteraction,
      deps,
      ctx,
    );
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    return dispatchModal(interaction as APIModalSubmitInteraction, deps, ctx);
  }

  return ephemeralMessage({
    title: "Interaction が未対応です",
    color: EmbedColor.Default,
    footer: {
      text: "Bot 管理者にお問い合わせください",
    },
  });
};

const dispatchCommand = (
  interaction: APIApplicationCommandInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> | APIInteractionResponse => {
  const { data } = interaction;
  if (!("options" in data)) {
    return ephemeralMessage({
      title: "サブコマンドが存在しません",
      color: EmbedColor.Default,
      footer: {
        text: "Bot 管理者にお問い合わせください",
      },
    });
  }

  const resolved = resolveCommand(data);
  if (!resolved) {
    return ephemeralMessage({
      title: "コマンドの解決に失敗しました",
      color: EmbedColor.Error,
      footer: {
        text: "Bot 管理者にお問い合わせください",
      },
    });
  }

  const cmd = COMMAND_GROUPS.find((c) => c.definition.name === resolved.group);
  if (cmd) {
    return cmd.handle(
      resolved.subcommand,
      resolved.options,
      interaction,
      deps,
      ctx,
    );
  }

  return ephemeralMessage({
    title: "コマンドが存在しません",
    color: EmbedColor.Default,
    footer: {
      text: "Bot 管理者にお問い合わせください",
    },
  });
};

const dispatchAutocomplete = (
  interaction: APIApplicationCommandAutocompleteInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> | APIInteractionResponse => {
  const { data } = interaction;
  const resolved = resolveCommand(data);
  if (!resolved) {
    return {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: { choices: [] },
    };
  }

  if (resolved.group === "discord") {
    return handleDiscordWebhookAutocomplete(interaction, deps, ctx);
  }

  if (resolved.group === "token") {
    return handleWebhookTokenAutocomplete(interaction, deps, ctx);
  }

  return {
    type: InteractionResponseType.ApplicationCommandAutocompleteResult,
    data: { choices: [] },
  };
};

const dispatchComponent = (
  interaction: APIMessageComponentInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> | APIInteractionResponse => {
  const { custom_id: customId } = interaction.data;

  if (customId.startsWith("webhook.discord.list.page:")) {
    return handleDiscordListPage(interaction, deps, ctx);
  }

  if (customId.startsWith("webhook.token.list.page:")) {
    return handleTokenListPage(interaction, deps, ctx);
  }

  if (customId.startsWith("webhook.discord.delete.")) {
    return handleConfirmDiscordWebhookDelete(interaction, deps, ctx);
  }

  if (customId.startsWith("webhook.token.delete.")) {
    return handleConfirmWebhookTokenDelete(interaction, deps, ctx);
  }

  return ephemeralMessage({
    description: "コンポーネントが未対応です",
    color: EmbedColor.Default,
    footer: {
      text: "Bot 管理者にお問い合わせください",
    },
  });
};

const dispatchModal = (
  interaction: APIModalSubmitInteraction,
  deps: InteractionsDependencies,
  ctx: GuildContext,
): Promise<APIInteractionResponse> | APIInteractionResponse => {
  const { custom_id: customId } = interaction.data;

  if (customId === "webhook.discord.create.modal") {
    return handleCreateDiscordWebhookModal(interaction, deps, ctx);
  }

  if (customId.startsWith("webhook.discord.update.modal:")) {
    return handleUpdateDiscordWebhookModal(interaction, deps, ctx);
  }

  if (customId.startsWith("webhook.token.create.modal")) {
    return handleCreateWebhookTokenModal(interaction, deps, ctx);
  }

  if (customId.startsWith("webhook.token.update.modal:")) {
    return handleUpdateWebhookTokenModal(interaction, deps, ctx);
  }

  return ephemeralMessage({
    description: "Modal が未対応です",
    color: EmbedColor.Default,
    footer: {
      text: "Bot 管理者にお問い合わせください",
    },
  });
};
