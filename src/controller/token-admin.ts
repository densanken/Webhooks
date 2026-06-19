import type { WebhookTokenUseCaseInterface } from "../usecase/token/interface.ts";

export type TokenAdminControllerDependencies = {
  webhookTokenUseCase: WebhookTokenUseCaseInterface;
};

export type CreateWebhookTokenRequest = {
  description: string;
};

export type UpdateWebhookTokenRequest = {
  description: string;
};

const requiredDescription = (description: string | undefined): string =>
  description ?? "";

export const createTokenAdminController = (
  dependencies: TokenAdminControllerDependencies,
) => ({
  createDynamicWebhookToken: async (
    input: CreateWebhookTokenRequest,
  ) => {
    const created = await dependencies.webhookTokenUseCase
      .createDynamicWebhookToken(input);

    return {
      uuid: created.uuid,
      description: requiredDescription(created.description),
      token: created.token,
      createdAt: created.createdAt,
    };
  },

  listDynamicWebhookTokens: () =>
    dependencies.webhookTokenUseCase.listDynamicWebhookTokens()
      .then((tokens) =>
        tokens.map((token) => ({
          ...token,
          description: requiredDescription(token.description),
        }))
      ),

  updateDynamicWebhookToken: async (
    uuid: string,
    input: UpdateWebhookTokenRequest,
  ) => {
    const updated = await dependencies.webhookTokenUseCase
      .updateDynamicWebhookToken(uuid, { description: input.description });
    if (updated === null) return null;

    return {
      ...updated,
      description: requiredDescription(updated.description),
    };
  },

  revokeDynamicWebhookToken: (uuid: string) =>
    dependencies.webhookTokenUseCase.revokeDynamicWebhookToken(uuid),
});
