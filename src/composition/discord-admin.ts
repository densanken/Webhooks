import { DiscordRegisteredWebhookRepository } from "../repository/discord/registered-webhook/impl.ts";
import { DiscordRegisteredWebhookUseCase } from "../usecase/discord/registered-webhook/impl.ts";

export type DiscordAdminCompositionOptions = {
  kv: Deno.Kv;
  publicBaseUrl?: string;
};

export const composeDiscordAdminUseCase = (
  options: DiscordAdminCompositionOptions,
) =>
  new DiscordRegisteredWebhookUseCase(
    new DiscordRegisteredWebhookRepository(options.kv),
    {
      publicBaseUrl: options.publicBaseUrl ?? Deno.env.get("PUBLIC_BASE_URL"),
    },
  );
