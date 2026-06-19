import { WebhookTokenRepository } from "../repository/token/impl.ts";
import { WebhookTokenUseCase } from "../usecase/token/impl.ts";

export type TokenAdminCompositionOptions = {
  kv: Deno.Kv;
};

export const composeTokenAdminUseCase = (
  options: TokenAdminCompositionOptions,
) =>
  new WebhookTokenUseCase(
    new WebhookTokenRepository(options.kv),
  );
