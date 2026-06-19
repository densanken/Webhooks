import type {
  DiscordExecuteResult,
  DiscordExecuteUseCaseInterface,
  ExecuteDynamicDiscordWebhookInput,
  ExecuteRegisteredDiscordWebhookInput,
} from "../usecase/discord/execute/interface.ts";

export type DiscordWebhookControllerDependencies = {
  discordExecuteUseCase: DiscordExecuteUseCaseInterface;
};

export type PublicDiscordWebhookResponse =
  | { statusCode: 204; body: null }
  | {
    statusCode: 202;
    body: { status: "queued"; reason: "blocked" | "rate_limited" };
  };

const toResponse = (
  result: DiscordExecuteResult,
): PublicDiscordWebhookResponse =>
  result.status === "sent" ? { statusCode: 204, body: null } : {
    statusCode: 202,
    body: { status: "queued", reason: result.reason },
  };

export const createDiscordWebhookController = (
  dependencies: DiscordWebhookControllerDependencies,
) => ({
  executeRegisteredDiscordWebhook: async (
    input: ExecuteRegisteredDiscordWebhookInput,
  ): Promise<PublicDiscordWebhookResponse> =>
    toResponse(
      await dependencies.discordExecuteUseCase
        .executeRegisteredDiscordWebhook(input),
    ),

  executeDynamicDiscordWebhook: async (
    input: ExecuteDynamicDiscordWebhookInput,
  ): Promise<PublicDiscordWebhookResponse> =>
    toResponse(
      await dependencies.discordExecuteUseCase
        .executeDynamicDiscordWebhook(input),
    ),
});
