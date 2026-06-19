import type { DiscordRegisteredWebhookUseCaseInterface } from "../usecase/discord/registered-webhook/interface.ts";

export type DiscordWebhookAdminControllerDependencies = {
  registeredDiscordWebhookUseCase: DiscordRegisteredWebhookUseCaseInterface;
};

export type CreateRegisteredDiscordWebhookRequest = {
  discordWebhookUrl: string;
  description: string;
};

export type UpdateRegisteredDiscordWebhookRequest = {
  description: string;
};

const requiredDescription = (description: string | undefined): string =>
  description ?? "";

export const createDiscordWebhookAdminController = (
  dependencies: DiscordWebhookAdminControllerDependencies,
) => ({
  createRegisteredDiscordWebhook: async (
    input: CreateRegisteredDiscordWebhookRequest,
  ) => {
    const created = await dependencies.registeredDiscordWebhookUseCase
      .createRegisteredDiscordWebhook(input);

    return {
      uuid: created.uuid,
      description: requiredDescription(created.description),
      webhookUrl: created.webhookUrl,
      discordWebhookUrl: created.discordWebhookUrl,
      createdAt: created.createdAt,
    };
  },

  listRegisteredDiscordWebhooks: () =>
    dependencies.registeredDiscordWebhookUseCase
      .listRegisteredDiscordWebhooks()
      .then((webhooks) =>
        webhooks.map((webhook) => ({
          ...webhook,
          description: requiredDescription(webhook.description),
        }))
      ),

  getRegisteredDiscordWebhook: async (uuid: string) => {
    const webhook = await dependencies.registeredDiscordWebhookUseCase
      .requireRegisteredDiscordWebhook(uuid);

    return {
      uuid: webhook.uuid,
      description: requiredDescription(webhook.description),
      discordWebhookUrl: webhook.discordWebhookUrl,
      webhookUrl: webhook.webhookUrl,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
    };
  },

  updateRegisteredDiscordWebhook: async (
    uuid: string,
    input: UpdateRegisteredDiscordWebhookRequest,
  ) => {
    const updated = await dependencies.registeredDiscordWebhookUseCase
      .updateRegisteredDiscordWebhook(uuid, { description: input.description });
    if (updated === null) return null;

    return {
      ...updated,
      description: requiredDescription(updated.description),
    };
  },

  revokeRegisteredDiscordWebhook: (uuid: string) =>
    dependencies.registeredDiscordWebhookUseCase
      .revokeRegisteredDiscordWebhook(uuid),
});
