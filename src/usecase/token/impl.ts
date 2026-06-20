import type { WebhookTokenRepositoryInterface } from "../../repository/token/interface.ts";
import { generateToken } from "../../util/crypto.ts";
import type {
  CreatedWebhookToken,
  CreateWebhookTokenInput,
  UpdateWebhookTokenInput,
  WebhookTokenUseCaseInterface,
  WebhookTokenUseCaseOptions,
} from "./interface.ts";
import { toWebhookTokenSummary } from "./mapper.ts";

export class WebhookTokenUseCase implements WebhookTokenUseCaseInterface {
  private readonly generateUuid: () => string;
  private readonly generateToken: () => string;

  constructor(
    private readonly repository: WebhookTokenRepositoryInterface,
    options: WebhookTokenUseCaseOptions = {},
  ) {
    this.generateUuid = options.generateUuid ?? (() => crypto.randomUUID());
    this.generateToken = options.generateToken ?? generateToken;
  }

  async createDynamicWebhookToken(
    input: CreateWebhookTokenInput,
  ): Promise<CreatedWebhookToken> {
    const token = this.generateToken();
    const record = await this.repository.createDynamicWebhookToken({
      uuid: this.generateUuid(),
      description: input.description,
      token,
      now: input.now,
    });

    return {
      ...toWebhookTokenSummary(record),
      token,
    };
  }

  async listDynamicWebhookTokens() {
    return (await this.repository.listDynamicWebhookTokens()).map(
      toWebhookTokenSummary,
    );
  }

  async updateDynamicWebhookToken(
    uuid: string,
    input: UpdateWebhookTokenInput,
  ) {
    const record = await this.repository.updateDynamicWebhookToken(uuid, {
      description: input.description,
      now: input.now,
    });
    if (record === null) return null;

    return toWebhookTokenSummary(record);
  }

  async revokeDynamicWebhookToken(uuid: string): Promise<boolean> {
    const record = await this.repository.getDynamicWebhookToken(uuid);
    if (record === null) return false;

    await this.repository.deleteDynamicWebhookToken(uuid);
    return true;
  }
}
